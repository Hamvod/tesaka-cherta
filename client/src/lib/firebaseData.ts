import type { User as FirebaseUser } from "firebase/auth";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { firestore } from "./firebase";

export type AccountProfile = {
  phone: string | null;
  city: string | null;
  language: "en" | "am";
  marketingOptIn: boolean;
};

export type AccountBid = {
  id: string;
  amount: string;
  createdAt: Date;
  auctionId: number;
  auctionTitle: string;
  auctionImagePath: string;
  auctionStatus: "live" | "closed";
};

export type SavedAuction = {
  id: string;
  auctionId: number | string;
  title: string;
  imagePath: string;
  endsAt: Date;
};

export type FirestoreAccountData = {
  profile: AccountProfile;
  bids: AccountBid[];
  savedAuctions: SavedAuction[];
};

const userDocument = (uid: string) => doc(firestore, "users", uid);
const userCollection = (uid: string, name: "bids" | "watchlist") => collection(userDocument(uid), name);

export async function ensureUserDocument(user: FirebaseUser): Promise<void> {
  const reference = userDocument(user.uid);
  const existing = await getDoc(reference);
  const profile = {
    uid: user.uid,
    name: user.displayName || user.email?.split("@")[0] || "Tesaka member",
    email: user.email,
    updatedAt: serverTimestamp(),
  };
  if (existing.exists()) {
    await setDoc(reference, profile, { merge: true });
  } else {
    await setDoc(reference, {
      ...profile,
      phone: user.phoneNumber,
      city: null,
      language: "en",
      marketingOptIn: false,
      createdAt: serverTimestamp(),
    });
  }
}

function toDate(value: unknown): Date {
  if (value instanceof Date) return value;
  if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") {
    return value.toDate();
  }
  if (typeof value === "string" || typeof value === "number") return new Date(value);
  return new Date();
}

export async function getAccountData(uid: string): Promise<FirestoreAccountData> {
  const profileSnapshot = await getDoc(userDocument(uid));
  const profileData = profileSnapshot.data() ?? {};
  const [bidsSnapshot, savedSnapshot] = await Promise.all([
    getDocs(userCollection(uid, "bids")),
    getDocs(userCollection(uid, "watchlist")),
  ]);

  const bids: AccountBid[] = bidsSnapshot.docs.map((snapshot) => {
    const data = snapshot.data();
    return {
      id: snapshot.id,
      amount: String(data.amount ?? "0.00"),
      createdAt: toDate(data.createdAt),
      auctionId: Number(data.auctionId ?? 0),
      auctionTitle: String(data.auctionTitle ?? "Auction"),
      auctionImagePath: String(data.auctionImagePath ?? ""),
      auctionStatus: data.auctionStatus === "closed" ? ("closed" as const) : ("live" as const),
    };
  }).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const savedAuctions: SavedAuction[] = savedSnapshot.docs.map((snapshot) => {
    const data = snapshot.data();
    return {
      id: snapshot.id,
      auctionId: typeof data.auctionId === "number" ? data.auctionId : String(data.auctionId ?? snapshot.id),
      title: String(data.title ?? "Auction"),
      imagePath: String(data.imagePath ?? ""),
      endsAt: toDate(data.endsAt),
    };
  }).sort((a, b) => a.endsAt.getTime() - b.endsAt.getTime());

  return {
    profile: {
      phone: typeof profileData.phone === "string" ? profileData.phone : null,
      city: typeof profileData.city === "string" ? profileData.city : null,
      language: profileData.language === "am" ? "am" : "en",
      marketingOptIn: profileData.marketingOptIn === true,
    },
    bids,
    savedAuctions,
  };
}

export async function saveAccountProfile(uid: string, values: AccountProfile): Promise<void> {
  await setDoc(userDocument(uid), { ...values, updatedAt: serverTimestamp() }, { merge: true });
}

export async function toggleSavedAuction(
  uid: string,
  auction: { auctionId: number | string; title: string; imagePath: string; endsAt: Date },
): Promise<boolean> {
  const reference = doc(userCollection(uid, "watchlist"), String(auction.auctionId));
  const existing = await getDoc(reference);
  if (existing.exists()) {
    await deleteDoc(reference);
    return false;
  }
  await setDoc(reference, { ...auction, createdAt: serverTimestamp() });
  return true;
}

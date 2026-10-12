import {
  collection,
  doc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  Timestamp,
  type Firestore,
} from "firebase/firestore";
import { amountToCents, calculateLowestUniqueBid } from "./auctionEngine";

type PublishResult = {
  resultType: "winner" | "no_unique_bid";
  referenceCode: string;
  winningAmount: number | null;
  validBidCount: number;
  resultHash: string;
  alreadyPublished?: boolean;
};

function millis(value: unknown): number {
  if (value instanceof Timestamp) return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  if (typeof value === "string") return Date.parse(value);
  return Number.NaN;
}

function maskPhone(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const phone = value.trim();
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 7) return null;
  return `${phone.slice(0, Math.max(0, phone.length - 4)).replace(/\d/g, "•")}••••${digits.slice(-4)}`;
}

async function sha256(value: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function createReferenceCode(auctionId: string): string {
  const random = Array.from(globalThis.crypto.getRandomValues(new Uint8Array(4)), (byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
  return `CH-${auctionId.slice(0, 8).toUpperCase()}-${random}`;
}

/**
 * Publish an ended auction result using the signed-in admin's Firestore client.
 * Firestore rules restrict all result/winner/audit writes in this transaction to admins.
 */
export async function publishFirestoreAuctionResult(database: Firestore, actorUid: string, auctionId: string): Promise<PublishResult> {
  if (!actorUid) throw new Error("Sign in as an administrator to publish a result.");
  if (!auctionId || auctionId.length > 128) throw new Error("Auction ID is invalid.");

  const auctionRef = doc(database, "auctions", auctionId);
  const resultRef = doc(database, "results", auctionId);
  const auditRef = doc(collection(database, "auditLogs"));
  const entriesQuery = query(collection(database, "auctions", auctionId, "entries"));
  const referenceCode = createReferenceCode(auctionId);
  const entriesSnapshot = await getDocs(entriesQuery);

  return runTransaction(database, async (transaction) => {
    const [auctionSnapshot, resultSnapshot] = await Promise.all([
      transaction.get(auctionRef), transaction.get(resultRef),
    ]);
    if (resultSnapshot.exists()) {
      const previous = resultSnapshot.data();
      return {
        resultType: previous.resultType === "winner" ? "winner" : "no_unique_bid",
        referenceCode: String(previous.referenceCode ?? ""),
        winningAmount: typeof previous.winningAmount === "number" ? previous.winningAmount : null,
        validBidCount: Number(previous.validBidCount ?? 0),
        resultHash: String(previous.resultHash ?? ""),
        alreadyPublished: true,
      };
    }
    if (!auctionSnapshot.exists()) throw new Error("Auction not found.");

    const auction = auctionSnapshot.data();
    const status = String(auction.status ?? "");
    if (status !== "live" && status !== "published") throw new Error("Only a live or published auction can be finalized.");
    const endsAt = millis(auction.endsAt);
    if (!Number.isFinite(endsAt) || endsAt > Date.now()) throw new Error("An auction can only be finalized after its scheduled end time.");

    const minimum = Number(auction.minBid);
    const maximum = Number(auction.maxBid);
    if (!Number.isFinite(minimum) || !Number.isFinite(maximum) || minimum <= 0 || maximum < minimum) {
      throw new Error("The auction bid limits are invalid; the result was not published.");
    }
    if (Number(auction.bidCount ?? 0) !== entriesSnapshot.size) {
      throw new Error("The bid list changed or is inconsistent. Refresh the admin page and retry before publishing.");
    }

    const entries = entriesSnapshot.docs.map((entry) => {
      const data = entry.data();
      if (typeof data.uid !== "string" || !data.uid) throw new Error("An accepted bid has no bidder reference; the result was not published.");
      const amount = Number(data.amount);
      const cents = amountToCents(amount);
      if (amount < minimum || amount > maximum) throw new Error("An accepted bid falls outside the auction limits; the result was not published.");
      return { id: entry.id, uid: data.uid, amount, cents };
    });

    const selected = calculateLowestUniqueBid(entries.map(({ id, amount }) => ({ id, amount })));
    const winner = selected ? entries.find((entry) => entry.id === selected.id) ?? null : null;
    const validBidCount = entries.length;
    const winningAmount = winner?.amount ?? null;
    const resultType = winner ? "winner" : "no_unique_bid";

    const frequencies = new Map<number, number>();
    for (const entry of entries) frequencies.set(entry.cents, (frequencies.get(entry.cents) ?? 0) + 1);
    const sortedCounts = Array.from(frequencies.entries()).sort(([left], [right]) => left - right).map(([cents, count]) => `${cents}:${count}`).join("|");
    const resultHash = await sha256(`cherta-result-v1|${auctionId}|${validBidCount}|${sortedCounts}`);
    const resultReferenceCode = referenceCode;

    let winnerName = "No winner declared";
    let maskedPhone: string | null = null;
    let winnerBidRef: ReturnType<typeof doc> | null = null;
    let winnerRecordRef: ReturnType<typeof doc> | null = null;
    let notificationRef: ReturnType<typeof doc> | null = null;
    if (winner) {
      winnerBidRef = doc(database, "users", winner.uid, "bids", winner.id);
      winnerRecordRef = doc(database, "users", winner.uid, "wins", auctionId);
      notificationRef = doc(database, "users", winner.uid, "notifications", `auction-${auctionId}-result`);
      const [profileSnapshot, winningBidSnapshot, previousWinSnapshot] = await Promise.all([
        transaction.get(doc(database, "users", winner.uid)),
        transaction.get(winnerBidRef),
        transaction.get(winnerRecordRef),
      ]);
      if (!winningBidSnapshot.exists()) throw new Error("The winner's bid history is missing; no result was published.");
      if (previousWinSnapshot.exists()) throw new Error("A winner record already exists without a published result; contact an administrator.");
      const winningBid = winningBidSnapshot.data();
      if (winningBid.auctionId !== auctionId || amountToCents(Number(winningBid.amount)) !== amountToCents(winner.amount)) {
        throw new Error("The winner's bid history does not match the accepted bid; no result was published.");
      }
      const profile = profileSnapshot.data();
      winnerName = String(profile?.name ?? "Winner");
      maskedPhone = maskPhone(profile?.phone);
    }

    const publishedAt = serverTimestamp();
    transaction.set(resultRef, {
      auctionId,
      title: String(auction.title ?? "Auction"),
      category: String(auction.category ?? "Other"),
      imagePath: String(auction.imagePath ?? ""),
      resultType,
      winningAmount,
      winnerName,
      maskedPhone,
      validBidCount,
      referenceCode: resultReferenceCode,
      resultHash,
      publishedAt,
    });
    transaction.update(auctionRef, {
      status: "completed",
      resultHash,
      resultReferenceCode,
      completedAt: publishedAt,
      updatedAt: publishedAt,
    });

    if (winner && winnerBidRef && winnerRecordRef && notificationRef) {
      transaction.update(winnerBidRef, { isWinningBid: true, auctionStatus: "completed" });
      transaction.set(winnerRecordRef, {
        auctionId,
        bidId: winner.id,
        amount: winningAmount,
        title: String(auction.title ?? "Auction"),
        imagePath: String(auction.imagePath ?? ""),
        referenceCode: resultReferenceCode,
        resultHash,
        createdAt: publishedAt,
      });
      transaction.set(notificationRef, {
        type: "auction_result",
        titleKey: "notice.auctionResult.title",
        bodyKey: "notice.auctionResult.body",
        params: { title: String(auction.title ?? "Auction"), result: "winner", amount: Number(winningAmount).toFixed(2) },
        createdAt: publishedAt,
        readAt: null,
      });
    }
    transaction.set(auditRef, {
      actorUid,
      action: "auction.result_published",
      entityType: "auction",
      entityId: auctionId,
      resultHash,
      referenceCode: resultReferenceCode,
      createdAt: publishedAt,
    });

    return { resultType, referenceCode: resultReferenceCode, winningAmount, validBidCount, resultHash };
  });
}

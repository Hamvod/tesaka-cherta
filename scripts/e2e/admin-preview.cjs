const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const path = require("node:path");
const { setTimeout: delay } = require("node:timers/promises");
const { chromium } = require("playwright");
const { initializeApp, getApps } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore, Timestamp } = require("firebase-admin/firestore");

const projectId = process.env.GCLOUD_PROJECT || "demo-tesaka-cherta";
const origin = "http://localhost:5173";
const testImage = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAALUlEQVR42mOUKo5mIAUwMZAIaK+BBZmzz4YDqyKnIz8Gsx+GgwYWXOE9hPwAAPNDBgqNaav3AAAAAElFTkSuQmCC", "base64");
const adminApp = getApps().length ? getApps()[0] : initializeApp({ projectId });
const adminAuth = getAuth(adminApp);
const db = getFirestore(adminApp);
const children = [];

function start(command, args, options = {}) {
  const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"], detached: true, ...options });
  children.push(child);
  child.stdout.on("data", (chunk) => process.stdout.write(`[preview] ${chunk}`));
  child.stderr.on("data", (chunk) => process.stderr.write(`[preview] ${chunk}`));
  return child;
}

async function waitForPreview(page) {
  let lastError;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await page.request.get(origin);
      if (response.ok()) return;
    } catch (error) { lastError = error; }
    await delay(500);
  }
  throw new Error(`Vite preview did not start: ${lastError || "timeout"}`);
}

async function createAccount(email, displayName, claims = {}, status = "active") {
  const user = await adminAuth.createUser({ email, password: "E2e-Test-Password!", displayName });
  if (Object.keys(claims).length) await adminAuth.setCustomUserClaims(user.uid, claims);
  await db.doc(`users/${user.uid}`).set({
    uid: user.uid, name: displayName, email, role: claims.admin ? "admin" : claims.owner ? "owner" : "user",
    status, createdAt: Timestamp.now(), updatedAt: Timestamp.now(),
  });
  return user;
}

async function signIn(page, email) {
  await page.goto(`${origin}/signin`);
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill("E2e-Test-Password!");
  await page.getByRole("button", { name: "Sign in with email" }).click();
  await page.waitForURL(/\/(admin|account)$/);
}

async function clickAdminTab(page, name) {
  await page.getByRole("navigation", { name: "Admin sections" }).getByRole("button", { name }).click();
}

async function seed() {
  const [admin, bidder, applicant, reportUser] = await Promise.all([
    createAccount("admin-e2e@tesaka.test", "E2E Administrator", { admin: true }),
    createAccount("bidder-e2e@tesaka.test", "E2E Bidder"),
    createAccount("seller-e2e@tesaka.test", "E2E Seller"),
    createAccount("reporter-e2e@tesaka.test", "E2E Reporter"),
  ]);
  const now = Date.now();
  const openAt = Timestamp.fromMillis(now - 60_000);
  const closesAt = Timestamp.fromMillis(now + 30 * 60_000);
  const auctionId = "e2e-fee-auction";
  await db.doc(`auctions/${auctionId}`).set({
    ownerUid: applicant.uid, ownerName: "E2E Seller", title: "E2E Fee Auction", category: "Phones",
    description: "A local emulator auction used to test proof verification and a one-time bid.",
    imagePath: "https://example.test/e2e.jpg", sellerName: "E2E Seller", bidFee: 10, minBid: 0.1, maxBid: 75,
    maxBidsPerUser: 5, startsAt: openAt, endsAt: closesAt, status: "live", bidCount: 0, createdAt: Timestamp.now(),
  });
  await db.doc("auctions/e2e-pending-listing").set({
    ownerUid: applicant.uid, ownerName: "E2E Seller", title: "E2E Listing Review", category: "Audio",
    description: "A local listing awaiting administrator review and publication.", imagePath: "https://example.test/pending.jpg",
    sellerName: "E2E Seller", bidFee: 10, minBid: 0.1, maxBid: 75, maxBidsPerUser: 5,
    startsAt: Timestamp.fromMillis(now + 60 * 60_000), endsAt: Timestamp.fromMillis(now + 2 * 60 * 60_000),
    status: "pending_review", bidCount: 0, createdAt: Timestamp.now(),
  });
  await db.doc(`ownerApplications/${applicant.uid}`).set({
    businessName: "E2E Seller Shop", city: "Addis Ababa", contactPhone: "+251911000000",
    description: "A fixture for testing seller application review.", status: "pending", submittedAt: Timestamp.now(),
  });
  await db.doc("reports/e2e-report").set({
    uid: reportUser.uid, category: "payment", subject: "E2E test report", details: "A seeded local report for testing admin response and private notes.",
    targetType: "auction", targetId: auctionId, status: "open", adminReply: null, createdAt: Timestamp.now(), updatedAt: Timestamp.now(),
  });
  await db.doc("reports/e2e-report/private/review").set({ adminNotes: null });
  await db.doc("auditLogs/e2e-event").set({
    actorUid: admin.uid, action: "e2e.seeded", entityType: "test", entityId: "admin-preview", createdAt: Timestamp.now(),
  });
  return { admin, bidder, applicant, reportUser, auctionId, now };
}

async function main() {
  if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    throw new Error("Run this test inside Firebase Auth and Firestore emulators; production is never a valid target.");
  }
  process.env.VITE_FIREBASE_USE_EMULATORS = "true";
  process.env.VITE_FIREBASE_PROJECT_ID = projectId;
  const fixture = await seed();
  const server = start(process.execPath, [path.join(process.cwd(), "node_modules/vite/bin/vite.js"), "--host", "0.0.0.0", "--port", "5173", "--strictPort"], {
    env: { ...process.env, VITE_FIREBASE_USE_EMULATORS: "true", VITE_FIREBASE_PROJECT_ID: projectId },
  });
  const browser = await chromium.launch({ executablePath: "/usr/bin/chromium", headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const adminContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  const pageErrors = [];
  adminPage.on("pageerror", (error) => pageErrors.push(error.message));
  adminPage.on("dialog", (dialog) => void dialog.accept());

  try {
    await waitForPreview(adminPage);
    await signIn(adminPage, "admin-e2e@tesaka.test");
    await adminPage.waitForURL(`${origin}/admin`);
    await adminPage.getByRole("heading", { name: "Admin portal" }).waitFor();
    await adminPage.getByText("FIREBASE ADMIN CLAIM VERIFIED").waitFor();
    await adminPage.getByText("E2E Fee Auction").waitFor();

    await clickAdminTab(adminPage, "Auctions");
    await adminPage.getByText("E2E Fee Auction").waitFor();
    await adminPage.getByRole("button", { name: "Create auction" }).click();
    const form = adminPage.locator("form").filter({ has: adminPage.getByLabel("Product title") });
    await form.getByLabel("Product title").fill("E2E Admin Created Draft");
    await form.getByLabel("Category").fill("Phones");
    await form.getByLabel("Seller display name").fill("Tesaka Cherta");
    await form.getByLabel("Product description").fill("A draft created from the admin page for end-to-end testing.");
    await form.locator('input[type="file"]').setInputFiles({
      name: "product.png", mimeType: "image/png",
      buffer: testImage,
    });
    await form.locator('img[alt="Product preview"]').waitFor({ state: "visible", timeout: 15_000 });
    await form.getByRole("button", { name: "Save draft" }).click();
    try {
      await adminPage.getByText("Auction draft saved.").waitFor({ timeout: 15_000 });
    } catch (error) {
      await adminPage.screenshot({ path: "/home/ubuntu/tesaka-cherta/admin-preview-failure.png", fullPage: true }).catch(() => {});
      const visibleText = await adminPage.locator("body").innerText().catch(() => "<page unavailable>");
      throw new Error(`Admin auction creation failed. Visible page text: ${visibleText.slice(-4000)}. ${error.message}`);
    }

    await clickAdminTab(adminPage, "Listing review");
    const listing = adminPage.locator("article").filter({ hasText: "E2E Listing Review" });
    await listing.getByRole("button", { name: "Approve and publish" }).click();
    await listing.waitFor({ state: "detached" });
    assert.equal((await db.doc("auctions/e2e-pending-listing").get()).get("status"), "published");

    await clickAdminTab(adminPage, "Owner applications");
    const application = adminPage.locator("article").filter({ hasText: "E2E Seller Shop" });
    await application.getByRole("button", { name: "Approve owner" }).click();
    await application.getByRole("button", { name: "Approve owner" }).waitFor({ state: "detached" });
    assert.equal((await adminAuth.getUser(fixture.applicant.uid)).customClaims.owner, true);

    await clickAdminTab(adminPage, "Users");
    const bidderCard = adminPage.locator("article").filter({ hasText: "bidder-e2e@tesaka.test" });
    await bidderCard.getByRole("button", { name: "Suspend" }).click();
    await adminPage.getByText("Account suspended.", { exact: true }).waitFor();
    await bidderCard.getByRole("button", { name: "Reactivate" }).waitFor();
    assert.equal((await adminAuth.getUser(fixture.bidder.uid)).disabled, true);
    await bidderCard.getByRole("button", { name: "Reactivate" }).click();
    await adminPage.getByText("Account reactivated.", { exact: true }).waitFor();
    assert.equal((await adminAuth.getUser(fixture.bidder.uid)).disabled, false);

    await clickAdminTab(adminPage, "Reports");
    const report = adminPage.locator("article").filter({ hasText: "E2E test report" });
    await report.locator("select").selectOption("resolved");
    await report.getByPlaceholder("Response to bidder").fill("We reviewed the report in the local test.");
    await report.getByPlaceholder("Private admin note").fill("Internal test note.");
    await report.getByRole("button", { name: "Save response" }).click();
    await adminPage.getByText("Report review saved.").waitFor();
    assert.equal((await db.doc("reports/e2e-report").get()).get("status"), "resolved");
    assert.equal((await db.doc("reports/e2e-report/private/review").get()).get("adminNotes"), "Internal test note.");

    await clickAdminTab(adminPage, "Payment records");
    await adminPage.getByText("Manual record only:").waitFor();
    await adminPage.getByLabel("Bidder account").selectOption(fixture.bidder.uid);
    await adminPage.getByLabel("Auction").selectOption(fixture.auctionId);
    await adminPage.getByLabel("External provider reference").fill("E2E-PENDING-MANUAL-001");
    await adminPage.getByRole("button", { name: "Add payment record" }).click();
    await adminPage.getByText("E2E-PENDING-MANUAL-001").waitFor();
    const manual = await db.collection(`users/${fixture.bidder.uid}/payments`).where("providerReference", "==", "E2E-PENDING-MANUAL-001").get();
    assert.equal(manual.size, 1);
    assert.equal(manual.docs[0].get("status"), "pending", "Manual record stays pending unless an admin explicitly confirms payment.");

    await clickAdminTab(adminPage, "Audit log");
    await adminPage.getByText("e2e.seeded").waitFor();
    await adminPage.getByText("report.review_updated").waitFor();

    const bidderContext = await browser.newContext();
    const bidderPage = await bidderContext.newPage();
    bidderPage.on("pageerror", (error) => pageErrors.push(error.message));
    await signIn(bidderPage, "bidder-e2e@tesaka.test");
    await bidderPage.goto(origin);
    const marketplaceCard = bidderPage.locator("article").filter({ hasText: "E2E Fee Auction" });
    await marketplaceCard.getByRole("button", { name: "View auction" }).click();
    await bidderPage.getByRole("link", { name: "Submit payment proof to unlock bidding" }).waitFor();
    await bidderPage.screenshot({ path: "/home/ubuntu/tesaka-cherta/home-payment-cta.png" });
    await bidderPage.getByRole("link", { name: "Submit payment proof to unlock bidding" }).click();
    await bidderPage.waitForURL(`${origin}/auction/${fixture.auctionId}`);
    await bidderPage.getByText("Submit payment proof", { exact: true }).waitFor();
    await bidderPage.getByLabel("Transaction reference (optional if you attach a receipt)").fill("E2E-TELEBIRR-RECEIPT-001");
    await bidderPage.locator('input[type="file"]').setInputFiles({
      name: "receipt.png", mimeType: "image/png",
      buffer: testImage,
    });
    await bidderPage.getByText("Ready", { exact: true }).waitFor({ timeout: 10_000 });
    await bidderPage.getByRole("button", { name: "Submit for verification" }).click();
    await bidderPage.getByText("Payment proof submitted. Bidding is enabled after administrator verification.").waitFor({ timeout: 15_000 });
    let proofQuery = await db.collection(`users/${fixture.bidder.uid}/payments`).where("providerReference", "==", "E2E-TELEBIRR-RECEIPT-001").get();
    assert.equal(proofQuery.size, 1);
    const proofId = proofQuery.docs[0].id;
    assert.equal(proofQuery.docs[0].get("status"), "pending");
    assert.equal(proofQuery.docs[0].get("hasReceiptImage"), true);

    await clickAdminTab(adminPage, "Payment records");
    await adminPage.getByRole("button", { name: "Refresh" }).click();
    const proofRow = adminPage.locator("article").filter({ hasText: "E2E-TELEBIRR-RECEIPT-001" });
    await proofRow.getByRole("button", { name: "View private receipt" }).click();
    await proofRow.locator('img[alt="Bidder payment receipt"]').waitFor({ state: "visible", timeout: 10_000 });
    await proofRow.getByRole("button", { name: "Confirm with provider · mark paid" }).click();
    await proofRow.getByText("paid", { exact: true }).waitFor();
    assert.equal((await db.doc(`users/${fixture.bidder.uid}/payments/${proofId}`).get()).get("status"), "paid");

    await bidderPage.goto(`${origin}/auction/${fixture.auctionId}`);
    await bidderPage.getByText("Verified payment available").waitFor({ timeout: 10_000 });
    await bidderPage.getByLabel("Your bid (ETB)").fill("3.50");
    await bidderPage.getByRole("button", { name: "Submit bid" }).click();
    await bidderPage.getByText("Your bid was accepted by the server.").waitFor({ timeout: 15_000 });
    assert.equal((await db.doc(`users/${fixture.bidder.uid}/payments/${proofId}`).get()).get("used"), true);
    assert.equal((await db.doc(`auctions/${fixture.auctionId}`).get()).get("bidCount"), 1);

    await db.doc(`auctions/${fixture.auctionId}`).update({ endsAt: Timestamp.fromMillis(Date.now() - 1_000) });
    await adminPage.goto(`${origin}/admin`);
    await clickAdminTab(adminPage, "Auctions");
    await adminPage.getByRole("button", { name: "Refresh" }).click();
    const liveAuction = adminPage.locator("article").filter({ hasText: "E2E Fee Auction" });
    await liveAuction.getByRole("button", { name: "Finalize + publish result" }).waitFor({ timeout: 15_000 });
    await liveAuction.getByRole("button", { name: "Finalize + publish result" }).click();
    await adminPage.getByText(/Result published: CH-/).waitFor({ timeout: 15_000 });
    const result = await db.doc(`results/${fixture.auctionId}`).get();
    assert.equal(result.exists, true);
    assert.equal(result.get("resultType"), "winner");
    assert.equal(result.get("winningAmount"), 3.5);
    assert.equal((await db.doc(`users/${fixture.bidder.uid}/wins/${fixture.auctionId}`).get()).exists, true);

    if (pageErrors.length) throw new Error(`Browser runtime errors: ${pageErrors.join(" | ")}`);
    await adminPage.screenshot({ path: "/home/ubuntu/tesaka-cherta/admin-preview.png", fullPage: true });
    console.log(JSON.stringify({
      ok: true, environment: "Firebase Auth/Firestore/Functions emulators only", adminTabs: ["overview", "auctions", "listing review", "owner applications", "users", "reports", "payment records", "audit log"],
      auctionDraftCreated: true, listingApproved: true, ownerApproved: true, userSuspendedAndReactivated: true, reportResolvedWithPrivateNote: true,
      receiptSubmittedPrivately: true, adminLoadedReceiptAndVerifiedPayment: true, paymentConsumedByOneBid: true,
      resultFinalizedAndWinnerRecorded: true, runtimeErrors: pageErrors.length,
      previewScreenshots: ["/home/ubuntu/tesaka-cherta/home-payment-cta.png", "/home/ubuntu/tesaka-cherta/admin-preview.png"],
    }, null, 2));
    await bidderContext.close();
  } catch (error) {
    const visibleText = await adminPage.locator("body").innerText().catch(() => "<page unavailable>");
    console.error(`Admin preview page at failure:\n${visibleText.slice(-6000)}`);
    await adminPage.screenshot({ path: "/home/ubuntu/tesaka-cherta/admin-preview-failure.png", fullPage: true }).catch(() => {});
    throw error;
  } finally {
    await browser.close();
    for (const child of children) {
      try { process.kill(-child.pid, "SIGTERM"); } catch { child.kill("SIGTERM"); }
    }
    await adminApp.delete();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

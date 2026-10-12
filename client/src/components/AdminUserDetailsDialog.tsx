import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getAdminUserDetails, type UserRecord } from "@/lib/firebaseData";
import type { ReactNode } from "react";

type Props = {
  user: UserRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function Field({ label, value }: { label: string; value: ReactNode }) {
  return <div className="min-w-0 rounded-xl bg-[#f8f6ef] p-3"><dt className="text-[10px] font-bold uppercase tracking-wide text-[#7b867c]">{label}</dt><dd className="mt-1 break-words text-sm font-medium text-[#173f36]">{value ?? "—"}</dd></div>;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <section className="min-w-0 rounded-2xl border border-[#e6dccb] bg-white p-4"><h3 className="mb-3 font-serif text-xl">{title}</h3>{children}</section>;
}

function Empty({ children = "No records." }: { children?: string }) {
  return <p className="text-sm text-[#7b867c]">{children}</p>;
}

export default function AdminUserDetailsDialog({ user, open, onOpenChange }: Props) {
  const details = useQuery({
    queryKey: ["firestore-admin-user-details", user?.uid],
    queryFn: () => getAdminUserDetails(user!.uid),
    enabled: open && Boolean(user),
  });

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[92vh] overflow-y-auto border-[#e6dccb] bg-[#fffdf8] text-[#173f36] sm:max-w-4xl">
      <DialogHeader className="pr-7 text-left">
        <DialogTitle className="font-serif text-2xl">{user?.name ?? "User details"}</DialogTitle>
        <DialogDescription className="break-all">{user?.email ?? user?.uid}</DialogDescription>
      </DialogHeader>
      {details.isLoading && <div className="rounded-xl bg-[#f8f6ef] p-6 text-sm">Loading user details…</div>}
      {details.isError && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{details.error instanceof Error ? details.error.message : "Could not load this user’s details."}</div>}
      {details.data && <div className="grid gap-4">
        <section className="rounded-2xl bg-[#e8f0e4] p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><p className="text-xs font-bold uppercase tracking-wide text-[#52705e]">Account</p><h2 className="mt-1 font-serif text-xl">{details.data.user.name}</h2><p className="mt-1 break-all text-sm">{details.data.user.email ?? "No email on file"}</p></div>
            <div className="flex gap-2"><span className="rounded-full bg-white px-3 py-1 text-xs font-bold">{details.data.user.role}</span><span className={`rounded-full px-3 py-1 text-xs font-bold ${details.data.user.status === "active" ? "bg-white text-[#0b5f4a]" : "bg-red-100 text-red-800"}`}>{details.data.user.status}</span></div>
          </div>
          <p className="mt-3 break-all text-xs text-[#52705e]">UID: {details.data.user.uid}</p>
        </section>

        <section>
          <h3 className="mb-2 font-serif text-xl">Profile information</h3>
          <dl className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Phone" value={details.data.profile.phone} />
            <Field label="City" value={details.data.profile.city} />
            <Field label="Language" value={details.data.profile.language === "am" ? "Amharic" : "English"} />
            <Field label="Marketing opt-in" value={details.data.profile.marketingOptIn ? "Yes" : "No"} />
            <Field label="Created" value={details.data.user.createdAt.toLocaleString()} />
            <Field label="Last signed in" value={details.data.user.lastSignedIn.toLocaleString()} />
            <Field label="Seller access" value={details.data.profile.ownerStatus} />
            <Field label="Seller application status" value={details.data.profile.ownerApplicationStatus} />
            <Field label="Status last changed" value={details.data.profile.statusChangedAt?.toLocaleString()} />
            <Field label="Status changed by (UID)" value={details.data.profile.statusChangedBy} />
          </dl>
        </section>

        {details.data.ownerApplication && <Section title="Seller application">
          <dl className="grid gap-2 sm:grid-cols-2">
            <Field label="Business" value={details.data.ownerApplication.businessName} />
            <Field label="Application status" value={details.data.ownerApplication.status} />
            <Field label="Contact phone" value={details.data.ownerApplication.contactPhone} />
            <Field label="Business city" value={details.data.ownerApplication.city} />
            <Field label="Submitted" value={details.data.ownerApplication.submittedAt.toLocaleString()} />
            <Field label="Review note" value={details.data.ownerApplication.reviewNote} />
          </dl>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-6">{details.data.ownerApplication.description || "No business description provided."}</p>
        </Section>}

        <section>
          <h3 className="mb-2 font-serif text-xl">Activity overview</h3>
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
            <Field label="Bids" value={details.data.account.bids.length} />
            <Field label="Wins" value={details.data.account.wins.length} />
            <Field label="Saved auctions" value={details.data.account.savedAuctions.length} />
            <Field label="Payments" value={details.data.payments.length} />
            <Field label="Reports" value={details.data.reports.length} />
            <Field label="Devices" value={details.data.account.devices.length} />
            <Field label="Notifications" value={details.data.account.notifications.length} />
          </dl>
        </section>

        <div className="grid gap-3 lg:grid-cols-2">
          <Section title="Recent bids">{details.data.account.bids.length ? <ul className="grid gap-2">{details.data.account.bids.slice(0, 8).map((bid) => <li key={bid.id} className="border-b border-[#eee6d8] pb-2 text-sm last:border-0"><strong>{bid.auctionTitle}</strong><p className="text-xs text-[#7b867c]">{bid.amount.toFixed(2)} ETB · {bid.createdAt.toLocaleString()} · {bid.auctionStatus}{bid.isWinningBid ? " · winning bid" : ""}</p></li>)}</ul> : <Empty />}</Section>
          <Section title="Payment records">{details.data.payments.length ? <ul className="grid gap-2">{details.data.payments.slice(0, 8).map((payment) => <li key={payment.id} className="border-b border-[#eee6d8] pb-2 text-sm last:border-0"><strong>{payment.auctionTitle} · {payment.amount.toFixed(2)} ETB</strong><p className="break-all text-xs text-[#7b867c]">{payment.provider} · {payment.source} · {payment.status}{payment.used ? " · used" : " · unused"} · {payment.providerReference || "no reference"}{payment.hasReceiptImage ? " · receipt attached" : ""}</p><p className="text-xs text-[#7b867c]">{payment.createdAt.toLocaleString()}{payment.verificationNote ? ` · ${payment.verificationNote}` : ""}</p></li>)}</ul> : <Empty />}</Section>
          <Section title="Wins">{details.data.account.wins.length ? <ul className="grid gap-2">{details.data.account.wins.slice(0, 8).map((win) => <li key={win.id} className="border-b border-[#eee6d8] pb-2 text-sm last:border-0"><strong>{win.title} · {win.amount.toFixed(2)} ETB</strong><p className="break-all text-xs text-[#7b867c]">Ref {win.referenceCode} · {win.createdAt.toLocaleString()}</p></li>)}</ul> : <Empty />}</Section>
          <Section title="Saved auctions">{details.data.account.savedAuctions.length ? <ul className="grid gap-2">{details.data.account.savedAuctions.slice(0, 8).map((saved) => <li key={saved.id} className="border-b border-[#eee6d8] pb-2 text-sm last:border-0"><strong>{saved.title}</strong><p className="text-xs text-[#7b867c]">Ends {saved.endsAt.toLocaleString()}</p></li>)}</ul> : <Empty />}</Section>
          <Section title="Support reports">{details.data.reports.length ? <ul className="grid gap-3">{details.data.reports.slice(0, 8).map((report) => <li key={report.id} className="border-b border-[#eee6d8] pb-2 last:border-0"><strong className="text-sm">{report.subject}</strong><p className="text-xs text-[#7b867c]">{report.category} · {report.status} · {report.createdAt.toLocaleString()}</p><p className="mt-1 whitespace-pre-wrap text-xs leading-5">{report.details}</p>{report.adminReply && <p className="mt-1 text-xs text-[#0b5f4a]">Reply: {report.adminReply}</p>}{report.adminNotes && <p className="mt-1 text-xs text-[#7b867c]">Internal note: {report.adminNotes}</p>}</li>)}</ul> : <Empty />}</Section>
          <Section title="Notifications">{details.data.account.notifications.length ? <ul className="grid gap-2">{details.data.account.notifications.slice(0, 8).map((notification) => <li key={notification.id} className="border-b border-[#eee6d8] pb-2 text-sm last:border-0"><strong>{notification.type}</strong><p className="break-all text-xs text-[#7b867c]">{notification.titleKey} · {notification.readAt ? "read" : "unread"} · {notification.createdAt.toLocaleString()}</p></li>)}</ul> : <Empty />}</Section>
          <Section title="Known devices">{details.data.account.devices.length ? <ul className="grid gap-3">{details.data.account.devices.slice(0, 8).map((device) => <li key={device.id} className="border-b border-[#eee6d8] pb-2 last:border-0"><strong className="text-sm">{device.label}{device.current ? " · this device" : ""}</strong><p className="text-xs text-[#7b867c]">First seen {device.firstSeen.toLocaleString()} · Last seen {device.lastSeen.toLocaleString()}</p><p className="mt-1 break-words text-[11px] leading-4 text-[#7b867c]">{device.userAgent || "Device details not recorded."}</p></li>)}</ul> : <Empty />}</Section>
        </div>
        <p className="text-xs text-[#7b867c]">This view shows account and activity records stored in Firestore. Passwords and authentication credentials are never displayed.</p>
      </div>}
    </DialogContent>
  </Dialog>;
}

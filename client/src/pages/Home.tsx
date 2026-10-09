import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { listAvailablePayments, listPublicAuctions, listPublicResults, submitFirestoreBid, toggleSavedAuction } from "@/lib/firebaseData";
import FirestoreImage from "@/components/FirestoreImage";
import { useLocation } from "wouter";
import {
  ArrowUpRight,
  Bell,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock3,
  Filter,
  Globe2,
  Heart,
  Landmark,
  LockKeyhole,
  Menu,
  MessageCircle,
  RefreshCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Trophy,
  Users,
  X,
  Zap,
} from "lucide-react";

type Language = "en" | "am";
type Category = "All" | "Phones" | "Home tech" | "Audio";

type Auction = {
  id: string;
  title: string;
  amTitle: string;
  category: Exclude<Category, "All">;
  image: string;
  code: string;
  time: string;
  ends: string;
  fee: number;
  bids: number;
  minBid: number;
  maxBid: number;
  startsAt: Date;
  endsAt: Date;
  status: "live" | "upcoming";
  sellerName: string;
  accent: string;
  featured?: boolean;
};

const copy = {
  en: {
    nav: ["Home", "Auctions", "Winners", "How it works", "Help"],
    browse: "Browse auctions",
    signIn: "Sign in",
    heroEyebrow: "Fair play, made local",
    heroTitle: "The smarter way to chase what you want.",
    heroBody:
      "Join transparent lowest-unique-bid auctions for the products you actually want. Set your limit, make your move, and follow the result.",
    explore: "Explore live auctions",
    how: "See how it works",
    trust: "Built for trust",
    trustBody: "Product details, clear rules, and results you can verify.",
    live: "Live now",
    ending: "Ending soon",
    featured: "Featured auction",
    upcoming: "Upcoming auctions",
    winners: "Recent winners",
    viewAll: "View all",
    livePill: "LIVE",
    viewAuction: "View auction",
    bidFee: "Bid fee",
    participants: "bids",
    transparent: "Transparent by design",
    transparentBody:
      "Every Cherta auction follows the same simple rule: the lowest amount submitted exactly once wins.",
    step1: "Choose your auction",
    step2: "Make a smart bid",
    step3: "Follow the result",
    learn: "Learn the 60-second version",
    winnerLine: "Real products. Clear winners.",
    winnerBody: "The latest wins from the Cherta community.",
    faq: "Questions? We have answers.",
    faqBody: "Start with the basics, then bid with confidence.",
    openFaq: "Open the FAQ",
    closing: "Closing",
    opens: "Opens",
    seller: "Seller",
    amount: "Enter your bid amount",
    submit: "Submit bid",
    cancel: "Cancel",
  },
  am: {
    nav: ["መነሻ", "ጨረታዎች", "አሸናፊዎች", "እንዴት ይሰራል", "እገዛ"],
    browse: "ጨረታዎችን ይመልከቱ",
    signIn: "ግባ",
    heroEyebrow: "ግልጽ ጨዋታ፣ ለኢትዮጵያ",
    heroTitle: "የምትፈልጉትን ለማግኘት ብልህ መንገድ።",
    heroBody:
      "በግልጽ የዝቅተኛ-ልዩ ጨረታዎች የምትፈልጉትን ምርት ይከታተሉ። ወሰንዎን ይወስኑ፣ ጥሩ ጨረታ ያቅርቡ፣ ውጤቱንም ይከታተሉ።",
    explore: "ቀጥታ ጨረታዎችን ይመልከቱ",
    how: "እንዴት እንደሚሰራ ይመልከቱ",
    trust: "ለእምነት የተሰራ",
    trustBody: "የምርት ዝርዝር፣ ግልጽ ህጎች፣ ሊረጋገጡ የሚችሉ ውጤቶች።",
    live: "አሁን በቀጥታ",
    ending: "በቅርቡ ይዘጋል",
    featured: "የተመረጠ ጨረታ",
    upcoming: "የሚመጡ ጨረታዎች",
    winners: "የቅርብ አሸናፊዎች",
    viewAll: "ሁሉንም ይመልከቱ",
    livePill: "ቀጥታ",
    viewAuction: "ጨረታውን ይመልከቱ",
    bidFee: "የጨረታ ክፍያ",
    participants: "ጨረታዎች",
    transparent: "በንድፍ ግልጽ",
    transparentBody: "በእያንዳንዱ ጨረታ ትክክለኛው አንድ ጊዜ የቀረበ ዝቅተኛ መጠን ያሸንፋል።",
    step1: "ጨረታዎን ይምረጡ",
    step2: "ብልህ ጨረታ ያቅርቡ",
    step3: "ውጤቱን ይከታተሉ",
    learn: "የ60 ሰከንድ ማብራሪያ",
    winnerLine: "እውነተኛ ምርቶች፣ ግልጽ አሸናፊዎች።",
    winnerBody: "ከ Cherta ማህበረሰብ የቅርብ ድሎች።",
    faq: "ጥያቄ አለዎት? መልስ አለን።",
    faqBody: "መሰረቱን ይማሩ፣ በእምነትም ይጫረቱ።",
    openFaq: "FAQ ይክፈቱ",
    closing: "የሚዘጋው",
    opens: "የሚጀምር",
    seller: "ሻጭ",
    amount: "የጨረታ መጠን ያስገቡ",
    submit: "ጨረታ ያቅርቡ",
    cancel: "ይቅር",
  },
} as const;

function BrandMark() {
  return (
    <div className="brand-mark" aria-hidden="true">
      <span className="brand-mark-dot" />
      <span className="brand-mark-line brand-mark-line-a" />
      <span className="brand-mark-line brand-mark-line-b" />
    </div>
  );
}

function AuctionCard({ auction, language, onOpen, onSave }: { auction: Auction; language: Language; onOpen: (auction: Auction) => void; onSave: (auction: Auction) => void }) {
  const t = copy[language];
  return (
    <article className={`auction-card group ${auction.featured ? "auction-card-featured" : ""}`}>
      <div className="auction-card-media">
        <FirestoreImage imagePath={auction.image} alt={auction.title} />
        <div className="auction-card-topline">
          <span className="status-pill"><span className="status-dot" />{auction.status === "upcoming" ? "UPCOMING" : t.livePill}</span>
          {auction.featured && <span className="featured-pill"><Sparkles size={12} /> {t.featured}</span>}
        </div>
        <button className="icon-button image-heart" aria-label={`Save ${auction.title}`} onClick={() => onSave(auction)}> <Heart size={16} /> </button>
      </div>
      <div className="auction-card-body">
        <div className="auction-card-meta"><span>{auction.category}</span><span>#{auction.code}</span></div>
        <h3>{language === "am" ? auction.amTitle : auction.title}</h3>
        <p className="seller-line"><ShieldCheck size={14} /> {auction.sellerName} · {t.seller}</p>
        <div className="auction-card-stats">
          <div><span>{auction.status === "live" ? t.closing : t.opens}</span><strong><Clock3 size={14} /> {auction.time}</strong></div>
          <div><span>{t.bidFee}</span><strong>{auction.fee} ETB</strong></div>
        </div>
        <div className="auction-card-footer">
          <span className="participants"><Users size={15} /> {auction.bids} {t.participants}</span>
          <button className="text-button" onClick={() => onOpen(auction)}>{t.viewAuction} <ArrowUpRight size={15} /></button>
        </div>
      </div>
    </article>
  );
}

export default function Home() {
  const { isAuthenticated, isAdmin, isSuspended, user } = useAuth();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const auctionQuery = useQuery({ queryKey: ["firestore-auctions"], queryFn: listPublicAuctions });
  const resultsQuery = useQuery({ queryKey: ["firestore-results"], queryFn: listPublicResults });
  const [language, setLanguage] = useState<Language>(() => localStorage.getItem("cherta-language") === "am" ? "am" : "en");
  const [now, setNow] = useState(() => Date.now());
  const [category, setCategory] = useState<Category>("All");
  const [query, setQuery] = useState("");
  const [selectedAuction, setSelectedAuction] = useState<Auction | null>(null);
  const [bidAmount, setBidAmount] = useState("2.50");
  const [menuOpen, setMenuOpen] = useState(false);
  const [bidSubmitting, setBidSubmitting] = useState(false);
  const availablePaymentsQuery = useQuery({
    queryKey: ["firestore-payments-available", user?.uid, selectedAuction?.id],
    queryFn: () => listAvailablePayments(user!.uid, selectedAuction!.id),
    enabled: Boolean(user && selectedAuction),
  });
  const t = copy[language];

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => { localStorage.setItem("cherta-language", language); }, [language]);

  const sourceAuctions = useMemo<Auction[]>(() => {
    if (!auctionQuery.data?.length) return [];
    return auctionQuery.data.map((auction, index) => {
      const targetTime = auction.startsAt.getTime() > now ? auction.startsAt.getTime() : auction.endsAt.getTime();
      const remaining = Math.max(0, targetTime - now);
      const days = Math.floor(remaining / 86400000);
      const hours = Math.floor((remaining % 86400000) / 3600000);
      const minutes = Math.floor((remaining % 3600000) / 60000);
      return {
      id: auction.id,
      title: auction.title,
      amTitle: auction.title,
      category: auction.category as Exclude<Category, "All">,
      image: auction.imagePath,
      code: String(auction.id).padStart(5, "0"),
      time: `${days}d : ${String(hours).padStart(2, "0")}h : ${String(minutes).padStart(2, "0")}m`,
      ends: auction.endsAt.toLocaleString(),
      fee: Number(auction.bidFee),
      bids: auction.bidCount,
      minBid: Number(auction.minBid),
      maxBid: Number(auction.maxBid),
      startsAt: auction.startsAt,
      endsAt: auction.endsAt,
      status: auction.startsAt.getTime() > now ? "upcoming" : "live",
      sellerName: auction.sellerName,
      accent: index === 0 ? "emerald" : index === 1 ? "amber" : "plum",
      featured: index === 0,
    };
    });
  }, [auctionQuery.data, now]);

  const featuredAuction = sourceAuctions[0];

  const visibleAuctions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return sourceAuctions.filter((auction) => {
      const matchesCategory = category === "All" || auction.category === category;
      const matchesQuery = !normalizedQuery || `${auction.title} ${auction.category} ${auction.sellerName}`.toLowerCase().includes(normalizedQuery);
      return matchesCategory && matchesQuery;
    });
  }, [category, query, sourceAuctions]);

  const handleSave = async (auction: Auction) => {
    if (!isAuthenticated) {
      setLocation("/signin");
      return;
    }
    if (!user) return;
    try {
      const saved = await toggleSavedAuction(user.uid, {
        auctionId: auction.id,
        title: auction.title,
        imagePath: auction.image,
        endsAt: auction.endsAt,
      });
      toast.success(saved ? "Saved to your Firestore watchlist" : "Removed from your watchlist");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update your Firestore watchlist");
    }
  };

  const handleBid = async () => {
    if (!selectedAuction) return;
    if (!isAuthenticated) {
      setSelectedAuction(null);
      setLocation("/signin");
      return;
    }
    if (!user) return;
    if (isSuspended) {
      toast.error("This account is suspended and cannot place bids.");
      return;
    }
    if (selectedAuction.status !== "live") {
      toast.info(`Bidding opens ${selectedAuction.startsAt.toLocaleString()}.`);
      return;
    }
    if (!/^\d+(\.\d{1,2})?$/.test(bidAmount) || !Number.isFinite(Number(bidAmount))) {
      toast.error("Enter a valid bid amount with up to two decimal places.");
      return;
    }
    const amount = Number(bidAmount).toFixed(2);
    if (Number(amount) < selectedAuction.minBid || Number(amount) > selectedAuction.maxBid) {
      toast.error(`Bid amount must be between ${selectedAuction.minBid.toFixed(2)} and ${selectedAuction.maxBid.toFixed(2)} ETB.`);
      return;
    }
    const payment = availablePaymentsQuery.data?.[0];
    if (selectedAuction.fee > 0 && !payment) {
      toast.info("A bid needs an administrator-verified payment first.", { description: "Contact the Cherta administrator with your payment reference. The site does not process payments directly." });
      return;
    }
    setBidSubmitting(true);
    try {
      await submitFirestoreBid(user.uid, selectedAuction.id, payment?.id ?? "", amount);
      toast.success("Bid submitted and recorded in Firestore.");
      setSelectedAuction(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["firestore-auctions"] }),
        queryClient.invalidateQueries({ queryKey: ["firestore-account", user.uid] }),
        queryClient.invalidateQueries({ queryKey: ["firestore-payments-available", user.uid] }),
      ]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not submit bid.");
    } finally {
      setBidSubmitting(false);
    }
  };

  const showHowItWorks = () => {
    document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="site-shell">
      <div className="top-ribbon">
        <div className="container ribbon-inner">
          <span><Sparkles size={13} /> {language === "am" ? "የኢትዮጵያ ግልጽ ጨረታ መድረክ" : "Ethiopia's transparent auction marketplace"}</span>
          <span className="ribbon-note">{language === "am" ? "የተረጋገጠ ሻጭ · ግልጽ ህጎች" : "Verified sellers · clear rules"}</span>
        </div>
      </div>

      <header className="main-header container">
        <a href="#top" className="brand-lockup" aria-label="Tesaka Cherta home">
          <BrandMark />
          <span><strong>Tesaka</strong><em>Cherta</em></span>
        </a>
        <nav className={`main-nav ${menuOpen ? "main-nav-open" : ""}`}>
          {t.nav.map((item, index) => <a key={item} href={index === 0 ? "#top" : index === 1 ? "#auctions" : index === 2 ? "/winners" : index === 3 ? "#how-it-works" : "#faq"}>{item}</a>)}
        </nav>
        <div className="header-actions">
          <button className="language-toggle" onClick={() => setLanguage(language === "en" ? "am" : "en")} aria-label="Toggle language"><Globe2 size={16} /><span>{language === "en" ? "EN" : "አማ"}</span><ChevronDown size={13} /></button>
          <button className="header-icon" aria-label="Notifications" onClick={() => toast.info("Notifications will appear here in the live product.")}><Bell size={17} /><i /></button>
          {isAuthenticated ? <button className="profile-chip" onClick={() => setLocation(isAdmin ? "/admin" : "/account")}><span>{(user?.name ?? "TC").slice(0, 1).toUpperCase()}</span>{isAdmin ? "Admin" : user?.name ?? "Member"}</button> : <button className="signin-button" onClick={() => setLocation("/signin")}>{t.signIn} <ArrowUpRight size={15} /></button>}
          <button className="mobile-menu" aria-label="Open menu" onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X size={21} /> : <Menu size={21} />}</button>
        </div>
      </header>

      <main id="top">
        <section className="hero-section container">
          <div className="hero-copy animate-fade-up">
            <div className="eyebrow"><span className="eyebrow-line" /> {t.heroEyebrow}</div>
            <h1>{t.heroTitle.split(" ").map((word, index) => <span key={`${word}-${index}`} className={index === 3 || index === 4 ? "hero-accent-word" : ""}>{word} </span>)}</h1>
            <p>{t.heroBody}</p>
            <div className="hero-actions"><button className="primary-button btn-spring" onClick={() => document.getElementById("auctions")?.scrollIntoView({ behavior: "smooth" })}>{t.explore} <ArrowUpRight size={17} /></button><button className="secondary-button btn-spring" onClick={showHowItWorks}><span className="play-dot">▶</span>{t.how}</button></div>
            <div className="hero-proof"><div className="avatar-stack"><ShieldCheck size={18} /></div><div><strong>Lowest unique bid</strong><small>Rules and limits are shown before you submit.</small></div></div>
          </div>
          <div className="hero-visual animate-fade-up delay-2">
            <div className="hero-orb orb-one" /><div className="hero-orb orb-two" />
            {featuredAuction ? <div className="hero-art-card"><div className="hero-art-top"><span className="status-pill"><span className="status-dot" /> {featuredAuction.status === "live" ? t.livePill : "UPCOMING"}</span><span className="hero-code">#{featuredAuction.code}</span></div><FirestoreImage imagePath={featuredAuction.image} alt={featuredAuction.title} eager /><div className="hero-art-bottom"><div><small>{featuredAuction.status === "live" ? t.ending : "Opens"}</small><strong>{featuredAuction.time}</strong></div><div className="hero-art-price"><small>{t.bidFee}</small><strong>{featuredAuction.fee} ETB</strong></div></div></div> : <div className="hero-art-card hero-art-card-empty"><div className="hero-art-top"><span className="status-pill">MARKETPLACE</span></div><div className="hero-empty-copy"><Sparkles size={27} /><strong>New auctions will appear here</strong><span>Listings are published by the Cherta administrator.</span></div></div>}
            <div className="float-card float-card-trust"><div className="float-icon green"><ShieldCheck size={18} /></div><div><strong>{t.trust}</strong><span>{t.trustBody}</span></div></div>
            <div className="float-card float-card-result"><div className="float-icon amber"><Trophy size={18} /></div><div><strong>Lowest unique wins</strong><span>Every result is recorded</span></div></div>
            <div className="hero-stamp"><span>Currency</span><strong>ETB</strong><span>Local marketplace</span></div>
          </div>
        </section>

        <section className="trust-strip container"><div className="trust-strip-item"><ShieldCheck size={19} /><span><strong>Product details</strong><small>Review listing information before joining</small></span></div><div className="trust-strip-item"><LockKeyhole size={19} /><span><strong>Clear participation</strong><small>See the fee and bid limits first</small></span></div><div className="trust-strip-item"><Landmark size={19} /><span><strong>ETB amounts</strong><small>Fees and bids are displayed in ETB</small></span></div><div className="trust-strip-item"><MessageCircle size={19} /><span><strong>Result references</strong><small>Published outcomes include a hash</small></span></div></section>

        <section id="auctions" className="auctions-section container">
          <div className="section-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> {t.live}</div><h2>Pick your next <em>smart move.</em></h2></div><button className="link-button" onClick={() => { setCategory("All"); setQuery(""); toast.info("Showing all live auctions"); }}>{t.viewAll} <ArrowUpRight size={15} /></button></div>
          <div className="auction-toolbar"><div className="search-box"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={language === "am" ? "ምርት ይፈልጉ..." : "Search products, sellers..."} /></div><div className="category-pills"><Filter size={15} />{(["All", "Phones", "Home tech", "Audio"] as Category[]).map((item) => <button key={item} className={category === item ? "category-pill-active" : ""} onClick={() => setCategory(item)}>{item === "All" ? (language === "am" ? "ሁሉም" : "All") : item}</button>)}</div><button className="filter-button" onClick={() => toast.info("More filters are coming to the live marketplace.")}><SlidersHorizontal size={15} /> Filters</button></div>
          <div className="auction-grid">{visibleAuctions.length ? visibleAuctions.map((auction) => <AuctionCard key={auction.id} auction={auction} language={language} onOpen={(item) => { setSelectedAuction(item); setBidAmount(item.minBid.toFixed(2)); }} onSave={handleSave} />) : <div className="empty-state">{auctionQuery.isLoading ? <RefreshCw size={24} className="animate-spin" /> : <Search size={24} />}<strong>{auctionQuery.isLoading ? "Loading auctions…" : auctionQuery.isError ? "Auction service is unavailable" : "No published auctions"}</strong><span>{auctionQuery.isError ? "Please try again later or contact support." : "Published auctions will appear here. Check back soon."}</span></div>}</div>
        </section>

        <section id="how-it-works" className="how-section">
          <div className="container how-layout"><div className="how-copy"><div className="eyebrow light"><span className="eyebrow-line" /> {t.transparent}</div><h2>{t.transparent}</h2><p>{t.transparentBody}</p><button className="light-button btn-spring" onClick={() => toast.info("The full learning guide is coming soon.")}>{t.learn} <ArrowUpRight size={16} /></button></div><div className="steps-grid"><div className="step-card"><span className="step-number">01</span><div className="step-icon"><Zap size={19} /></div><h3>{t.step1}</h3><p>Browse product listings and read the rules before joining.</p></div><div className="step-card step-card-raised"><span className="step-number">02</span><div className="step-icon"><Sparkles size={19} /></div><h3>{t.step2}</h3><p>Choose a bid amount within the auction limits. No guesswork.</p></div><div className="step-card"><span className="step-number">03</span><div className="step-icon"><Trophy size={19} /></div><h3>{t.step3}</h3><p>The lowest amount submitted exactly once wins the product.</p></div></div></div>
        </section>

        <section id="winners" className="winners-section container">
          <div className="section-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> {t.winners}</div><h2>{t.winnerLine}</h2><p>{t.winnerBody}</p></div><button className="link-button" onClick={() => setLocation("/winners")}>{t.viewAll} <ArrowUpRight size={15} /></button></div>
          <div className="winner-grid">
            {resultsQuery.data?.slice(0, 3).map((result) => <article className="winner-stat-card" key={result.auctionId}>
              <div className="winner-stat-icon"><Trophy size={21} /></div>
              <strong>{result.resultType === "winner" ? `${result.winningAmount} ETB` : "No unique bid"}</strong>
              <span>{result.resultType === "winner" ? result.winnerName ?? "Winner" : "No winner declared"}</span>
              <div className="winner-stat-rule" />
              <p>{result.title} · {result.validBidCount} valid bids · {result.referenceCode}{result.maskedPhone ? ` · ${result.maskedPhone}` : ""}</p>
              <button className="text-button" onClick={() => toast.info(`Verification SHA-256: ${result.resultHash}`)}>Verify result <ChevronRight size={15} /></button>
            </article>)}
            {!resultsQuery.isLoading && !resultsQuery.data?.length && <div className="empty-state"><Trophy size={24} /><strong>No results published yet</strong><span>Finalized auction results will appear here with a public verification reference.</span></div>}
            {resultsQuery.isLoading && <div className="empty-state"><RefreshCw size={22} className="animate-spin" /><strong>Loading results…</strong></div>}
          </div>
        </section>

        <section id="faq" className="faq-section container"><div className="faq-inner"><div><div className="eyebrow"><span className="eyebrow-line" /> {t.faq}</div><h2>{t.faq}</h2><p>{t.faqBody}</p></div><button className="secondary-button btn-spring" onClick={() => toast.info("FAQ center will open here in the next release.")}>{t.openFaq} <ArrowUpRight size={16} /></button></div></section>
      </main>

      <footer className="site-footer"><div className="container footer-grid"><div><a href="#top" className="brand-lockup footer-brand"><BrandMark /><span><strong>Tesaka</strong><em>Cherta</em></span></a><p>Fair play, made local.<br />ግልጽ ጨረታ፣ ለሁሉም።</p></div><div><h4>Explore</h4><a href="#auctions">Live auctions</a><a href="#winners">Winners</a><a href="#how-it-works">How it works</a></div><div><h4>Trust</h4><a href="#faq">FAQ & rules</a><a href="#faq">Responsible play</a><a href="#faq">Contact support</a></div><div className="footer-note"><span className="footer-dot" /> Built for the next smart move.<small>© 2026 Tesaka Cherta · Addis Ababa, Ethiopia</small></div></div></footer>

      {selectedAuction && <div className="modal-backdrop" onClick={() => setSelectedAuction(null)}><div className="auction-modal" onClick={(event) => event.stopPropagation()}><button className="modal-close" onClick={() => setSelectedAuction(null)} aria-label="Close"><X size={19} /></button><div className="modal-image"><FirestoreImage imagePath={selectedAuction.image} alt={selectedAuction.title} eager /></div><div className="modal-content"><span className="status-pill"><span className="status-dot" /> {selectedAuction.status === "live" ? t.livePill : "UPCOMING"} · #{selectedAuction.code}</span><h2>{selectedAuction.title}</h2><p className="modal-seller"><ShieldCheck size={15} /> {selectedAuction.sellerName} · {t.seller}</p><div className="modal-rule"><div className="modal-rule-icon"><CheckCircle2 size={17} /></div><div><strong>Lowest unique bid</strong><span>The lowest valid amount submitted exactly once wins. Duplicate amounts are not unique.</span></div></div><div className="modal-stats"><div><small>{selectedAuction.status === "live" ? t.closing : "Opens"}</small><strong>{selectedAuction.status === "live" ? selectedAuction.ends : selectedAuction.startsAt.toLocaleString()}</strong></div><div><small>{t.bidFee}</small><strong>{selectedAuction.fee} ETB</strong></div><div><small>Bid limits</small><strong>{selectedAuction.minBid.toFixed(2)}–{selectedAuction.maxBid.toFixed(2)} ETB</strong></div></div><label className="bid-label">{t.amount}<div className="bid-input-wrap"><input value={bidAmount} onChange={(event) => setBidAmount(event.target.value.replace(/[^0-9.]/g, ""))} inputMode="decimal" /><span>ETB</span></div></label><div className="modal-actions"><button className="primary-button btn-spring" onClick={() => void handleBid()} disabled={selectedAuction.status !== "live" || bidSubmitting || isSuspended || (selectedAuction.fee > 0 && !availablePaymentsQuery.data?.length)}>{bidSubmitting ? "Submitting bid…" : t.submit} <ArrowUpRight size={16} /></button><button className="cancel-button" onClick={() => setSelectedAuction(null)}>{t.cancel}</button></div><a href={`/auction/${selectedAuction.id}`} className="text-button mt-3">{language === "am" ? "ሙሉ ዝርዝርና ሪፖርት ክፈት" : "Open full details and report options"} <ArrowUpRight size={14} /></a><small className="demo-note">{!isAuthenticated ? "Sign in is required to bid." : isSuspended ? "This account is suspended." : selectedAuction.fee === 0 ? "No participation payment is required." : availablePaymentsQuery.isLoading ? "Checking for administrator-verified payment…" : availablePaymentsQuery.data?.length ? "A verified payment is available. One payment can be used for one bid." : "Payment processing is not connected. An administrator must verify and record your payment before bidding."}</small></div></div></div>}
    </div>
  );
}

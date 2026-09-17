import { useMemo, useState } from "react";
import { toast } from "sonner";
import { startLogin } from "@/const";
import { useAuth } from "@/_core/hooks/useAuth";
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
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Trophy,
  Users,
  X,
  Zap,
} from "lucide-react";

const productImages = {
  phone: "/manus-storage/tesaka_cherta_phone_74bf5de2.jpg",
  tv: "/manus-storage/tesaka_cherta_tv_503427d1.jpg",
  headphones: "/manus-storage/tesaka_cherta_headphones_dd2c6f2e.jpg",
};

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
  verified: string;
  accent: string;
  featured?: boolean;
};

const auctions: Auction[] = [
  {
    id: "a17",
    title: "A17 Pro · 256GB",
    amTitle: "A17 Pro · 256GB",
    category: "Phones",
    image: productImages.phone,
    code: "218",
    time: "08d : 04h : 52m",
    ends: "Sat, Sep 26 · 8:00 PM",
    fee: 50,
    bids: 798,
    verified: "Nile Mobile",
    accent: "emerald",
    featured: true,
  },
  {
    id: "vision",
    title: "Vision 55 4K Smart TV",
    amTitle: "Vision 55 4K Smart TV",
    category: "Home tech",
    image: productImages.tv,
    code: "221",
    time: "03d : 12h : 09m",
    ends: "Tue, Sep 22 · 6:30 PM",
    fee: 45,
    bids: 432,
    verified: "Habesha Home",
    accent: "amber",
  },
  {
    id: "sound",
    title: "SoundArc Studio ANC",
    amTitle: "SoundArc Studio ANC",
    category: "Audio",
    image: productImages.headphones,
    code: "224",
    time: "11d : 19h : 31m",
    ends: "Wed, Sep 30 · 7:15 PM",
    fee: 35,
    bids: 198,
    verified: "Addis Audio",
    accent: "plum",
  },
];

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
    trustBody: "Verified products, clear rules, and results you can understand.",
    live: "Live now",
    ending: "Ending soon",
    featured: "Featured auction",
    upcoming: "Upcoming auctions",
    winners: "Recent winners",
    viewAll: "View all",
    livePill: "LIVE",
    viewAuction: "View auction",
    bidFee: "Bid fee",
    participants: "participants",
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
    seller: "Verified seller",
    amount: "Enter your bid amount",
    submit: "Submit demo bid",
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
    trustBody: "የተረጋገጡ ምርቶች፣ ግልጽ ህጎች፣ ቀላል ውጤቶች።",
    live: "አሁን በቀጥታ",
    ending: "በቅርቡ ይዘጋል",
    featured: "የተመረጠ ጨረታ",
    upcoming: "የሚመጡ ጨረታዎች",
    winners: "የቅርብ አሸናፊዎች",
    viewAll: "ሁሉንም ይመልከቱ",
    livePill: "ቀጥታ",
    viewAuction: "ጨረታውን ይመልከቱ",
    bidFee: "የጨረታ ክፍያ",
    participants: "ተሳታፊዎች",
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
    seller: "የተረጋገጠ ሻጭ",
    amount: "የጨረታ መጠን ያስገቡ",
    submit: "የሙከራ ጨረታ ያቅርቡ",
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

function AuctionCard({ auction, language, onOpen }: { auction: Auction; language: Language; onOpen: (auction: Auction) => void }) {
  const t = copy[language];
  return (
    <article className={`auction-card group ${auction.featured ? "auction-card-featured" : ""}`}>
      <div className="auction-card-media">
        <img src={auction.image} alt={auction.title} />
        <div className="auction-card-topline">
          <span className="status-pill"><span className="status-dot" />{t.livePill}</span>
          {auction.featured && <span className="featured-pill"><Sparkles size={12} /> {t.featured}</span>}
        </div>
        <button className="icon-button image-heart" aria-label={`Save ${auction.title}`} onClick={() => toast.success("Saved to your watchlist")}> <Heart size={16} /> </button>
      </div>
      <div className="auction-card-body">
        <div className="auction-card-meta"><span>{auction.category}</span><span>#{auction.code}</span></div>
        <h3>{language === "am" ? auction.amTitle : auction.title}</h3>
        <p className="seller-line"><ShieldCheck size={14} /> {auction.verified} · {t.seller}</p>
        <div className="auction-card-stats">
          <div><span>{t.closing}</span><strong><Clock3 size={14} /> {auction.time}</strong></div>
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
  const { isAuthenticated, user } = useAuth();
  const [language, setLanguage] = useState<Language>("en");
  const [category, setCategory] = useState<Category>("All");
  const [query, setQuery] = useState("");
  const [selectedAuction, setSelectedAuction] = useState<Auction | null>(null);
  const [bidAmount, setBidAmount] = useState("2.50");
  const [menuOpen, setMenuOpen] = useState(false);
  const t = copy[language];

  const visibleAuctions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return auctions.filter((auction) => {
      const matchesCategory = category === "All" || auction.category === category;
      const matchesQuery = !normalizedQuery || `${auction.title} ${auction.category} ${auction.verified}`.toLowerCase().includes(normalizedQuery);
      return matchesCategory && matchesQuery;
    });
  }, [category, query]);

  const handleBid = () => {
    if (!selectedAuction) return;
    toast.success(language === "am" ? "የሙከራ ጨረታዎ ተመዝግቧል።" : "Your demo bid has been recorded.", {
      description: `${selectedAuction.title} · ${bidAmount} ETB`,
    });
    setSelectedAuction(null);
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
          {t.nav.map((item, index) => <a key={item} href={index === 0 ? "#top" : index === 1 ? "#auctions" : index === 2 ? "#winners" : index === 3 ? "#how-it-works" : "#faq"}>{item}</a>)}
        </nav>
        <div className="header-actions">
          <button className="language-toggle" onClick={() => setLanguage(language === "en" ? "am" : "en")} aria-label="Toggle language"><Globe2 size={16} /><span>{language === "en" ? "EN" : "አማ"}</span><ChevronDown size={13} /></button>
          <button className="header-icon" aria-label="Notifications" onClick={() => toast.info("Notifications will appear here in the live product.")}><Bell size={17} /><i /></button>
          {isAuthenticated ? <button className="profile-chip" onClick={() => toast.info(`Signed in as ${user?.name ?? "Tesaka member"}`)}><span>{(user?.name ?? "TC").slice(0, 1).toUpperCase()}</span>{user?.name ?? "Member"}</button> : <button className="signin-button" onClick={startLogin}>{t.signIn} <ArrowUpRight size={15} /></button>}
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
            <div className="hero-proof"><div className="avatar-stack"><span>AA</span><span>MH</span><span>DK</span><span>+</span></div><div><strong>2,400+</strong><small>{language === "am" ? "የታመኑ ተሳታፊዎች" : "people already playing fair"}</small></div></div>
          </div>
          <div className="hero-visual animate-fade-up delay-2">
            <div className="hero-orb orb-one" /><div className="hero-orb orb-two" />
            <div className="hero-art-card"><div className="hero-art-top"><span className="status-pill"><span className="status-dot" /> {t.livePill}</span><span className="hero-code">#218</span></div><img src={productImages.phone} alt="Emerald smartphone auction prize" /><div className="hero-art-bottom"><div><small>{t.ending}</small><strong>08<span>d</span> : 04<span>h</span> : 52<span>m</span></strong></div><div className="hero-art-price"><small>{t.bidFee}</small><strong>50 ETB</strong></div></div></div>
            <div className="float-card float-card-trust"><div className="float-icon green"><ShieldCheck size={18} /></div><div><strong>{t.trust}</strong><span>{t.trustBody}</span></div></div>
            <div className="float-card float-card-result"><div className="float-icon amber"><Trophy size={18} /></div><div><strong>Lowest unique wins</strong><span>Every result is recorded</span></div></div>
            <div className="hero-stamp"><span>Since</span><strong>2026</strong><span>Addis Ababa</span></div>
          </div>
        </section>

        <section className="trust-strip container"><div className="trust-strip-item"><ShieldCheck size={19} /><span><strong>Verified products</strong><small>From trusted local sellers</small></span></div><div className="trust-strip-item"><LockKeyhole size={19} /><span><strong>Clear participation</strong><small>Know the fee before you bid</small></span></div><div className="trust-strip-item"><Landmark size={19} /><span><strong>ETB native</strong><small>Built for how we pay</small></span></div><div className="trust-strip-item"><MessageCircle size={19} /><span><strong>Human support</strong><small>We are here when you need us</small></span></div></section>

        <section id="auctions" className="auctions-section container">
          <div className="section-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> {t.live}</div><h2>Pick your next <em>smart move.</em></h2></div><button className="link-button" onClick={() => { setCategory("All"); setQuery(""); toast.info("Showing all live auctions"); }}>{t.viewAll} <ArrowUpRight size={15} /></button></div>
          <div className="auction-toolbar"><div className="search-box"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={language === "am" ? "ምርት ይፈልጉ..." : "Search products, sellers..."} /></div><div className="category-pills"><Filter size={15} />{(["All", "Phones", "Home tech", "Audio"] as Category[]).map((item) => <button key={item} className={category === item ? "category-pill-active" : ""} onClick={() => setCategory(item)}>{item === "All" ? (language === "am" ? "ሁሉም" : "All") : item}</button>)}</div><button className="filter-button" onClick={() => toast.info("More filters are coming to the live marketplace.")}><SlidersHorizontal size={15} /> Filters</button></div>
          <div className="auction-grid">{visibleAuctions.length ? visibleAuctions.map((auction) => <AuctionCard key={auction.id} auction={auction} language={language} onOpen={setSelectedAuction} />) : <div className="empty-state"><Search size={24} /><strong>No auctions found</strong><span>Try another search or category.</span></div>}</div>
        </section>

        <section id="how-it-works" className="how-section">
          <div className="container how-layout"><div className="how-copy"><div className="eyebrow light"><span className="eyebrow-line" /> {t.transparent}</div><h2>{t.transparent}</h2><p>{t.transparentBody}</p><button className="light-button btn-spring" onClick={() => toast.info("The full learning guide is coming soon.")}>{t.learn} <ArrowUpRight size={16} /></button></div><div className="steps-grid"><div className="step-card"><span className="step-number">01</span><div className="step-icon"><Zap size={19} /></div><h3>{t.step1}</h3><p>Browse verified products and read the rules before joining.</p></div><div className="step-card step-card-raised"><span className="step-number">02</span><div className="step-icon"><Sparkles size={19} /></div><h3>{t.step2}</h3><p>Choose a bid amount within the auction limits. No guesswork.</p></div><div className="step-card"><span className="step-number">03</span><div className="step-icon"><Trophy size={19} /></div><h3>{t.step3}</h3><p>The lowest amount submitted exactly once wins the product.</p></div></div></div>
        </section>

        <section id="winners" className="winners-section container"><div className="section-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> {t.winners}</div><h2>{t.winnerLine}</h2><p>{t.winnerBody}</p></div><button className="link-button" onClick={() => toast.info("Winner gallery is being curated for launch.")}>{t.viewAll} <ArrowUpRight size={15} /></button></div><div className="winner-grid"><div className="winner-feature"><img src={productImages.tv} alt="Winner's smart TV" /><div className="winner-feature-overlay"><span>WINNER · #209</span><strong>“A clear process from start to finish.”</strong><small>— Meron, Addis Ababa</small></div></div><div className="winner-stat-card"><div className="winner-stat-icon"><Trophy size={21} /></div><strong>12.54 ETB</strong><span>Lowest unique win</span><div className="winner-stat-rule" /><p>Every completed auction gets a result reference you can follow.</p><button className="text-button" onClick={() => toast.info("Result references will be public after launch.")}>How results work <ChevronRight size={15} /></button></div><div className="winner-quote-card"><div className="quote-mark">“</div><p>“I liked seeing the rule explained before I joined. It felt different from the usual prize apps.”</p><div className="quote-person"><span>NA</span><div><strong>Nati A.</strong><small>Early Cherta member</small></div></div></div></div></section>

        <section id="faq" className="faq-section container"><div className="faq-inner"><div><div className="eyebrow"><span className="eyebrow-line" /> {t.faq}</div><h2>{t.faq}</h2><p>{t.faqBody}</p></div><button className="secondary-button btn-spring" onClick={() => toast.info("FAQ center will open here in the next release.")}>{t.openFaq} <ArrowUpRight size={16} /></button></div></section>
      </main>

      <footer className="site-footer"><div className="container footer-grid"><div><a href="#top" className="brand-lockup footer-brand"><BrandMark /><span><strong>Tesaka</strong><em>Cherta</em></span></a><p>Fair play, made local.<br />ግልጽ ጨረታ፣ ለሁሉም።</p></div><div><h4>Explore</h4><a href="#auctions">Live auctions</a><a href="#winners">Winners</a><a href="#how-it-works">How it works</a></div><div><h4>Trust</h4><a href="#faq">FAQ & rules</a><a href="#faq">Responsible play</a><a href="#faq">Contact support</a></div><div className="footer-note"><span className="footer-dot" /> Built for the next smart move.<small>© 2026 Tesaka Cherta · Addis Ababa, Ethiopia</small></div></div></footer>

      {selectedAuction && <div className="modal-backdrop" onClick={() => setSelectedAuction(null)}><div className="auction-modal" onClick={(event) => event.stopPropagation()}><button className="modal-close" onClick={() => setSelectedAuction(null)} aria-label="Close"><X size={19} /></button><div className="modal-image"><img src={selectedAuction.image} alt={selectedAuction.title} /></div><div className="modal-content"><span className="status-pill"><span className="status-dot" /> {t.livePill} · #{selectedAuction.code}</span><h2>{selectedAuction.title}</h2><p className="modal-seller"><ShieldCheck size={15} /> {selectedAuction.verified} · {t.seller}</p><div className="modal-rule"><div className="modal-rule-icon"><CheckCircle2 size={17} /></div><div><strong>Lowest unique bid</strong><span>The lowest amount submitted exactly once wins.</span></div></div><div className="modal-stats"><div><small>{t.closing}</small><strong>{selectedAuction.ends}</strong></div><div><small>{t.bidFee}</small><strong>{selectedAuction.fee} ETB</strong></div></div><label className="bid-label">{t.amount}<div className="bid-input-wrap"><input value={bidAmount} onChange={(event) => setBidAmount(event.target.value.replace(/[^0-9.]/g, ""))} inputMode="decimal" /><span>ETB</span></div></label><div className="modal-actions"><button className="primary-button btn-spring" onClick={handleBid}>{t.submit} <ArrowUpRight size={16} /></button><button className="cancel-button" onClick={() => setSelectedAuction(null)}>{t.cancel}</button></div><small className="demo-note">Demo mode · Your bid is not charged in this preview.</small></div></div></div>}
    </div>
  );
}

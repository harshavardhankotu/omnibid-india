import React, { createContext, useContext, useState, useEffect } from "react";

export type SupportedLanguage = "en" | "hi" | "te";

interface I18nContextType {
  language: SupportedLanguage;
  setLanguage: (lang: SupportedLanguage) => void;
  t: (key: string) => string;
}

const TRANSLATIONS: Record<SupportedLanguage, Record<string, string>> = {
  en: {
    browse: "Browse",
    post_problem: "Post Problem",
    analytics: "Analytics",
    market: "Market",
    login: "Login",
    join_free: "Join Free",
    logout: "Logout",
    tagline: "Bharat's Reverse-Auction Procurement Marketplace",
    escrow_guarantee: "100% Escrow Protected by OmniBid India",
    zero_dispute: "Zero Dispute Guarantee · GST Rule 46 Compliant",
    l1_leader: "L1 Lowest Compliant Bid",
    place_bid: "Place Reverse Bid",
    two_envelope: "Two-Envelope Technical & Financial Sealed Bidding",
    milestone_payout: "Milestone-Linked Escrow Disbursements",
    verified_contractor: "DigiLocker & GST Verified Contractor",
  },
  hi: {
    browse: "ब्राउज़ करें",
    post_problem: "समस्या पोस्ट करें",
    analytics: "एनालिटिक्स",
    market: "बाज़ार",
    login: "लॉग इन",
    join_free: "मुफ़्त जुड़ें",
    logout: "लॉग आउट",
    tagline: "भारत का रिवर्स-ऑक्शन प्रोक्योरमेंट मार्केटप्लेस",
    escrow_guarantee: "ओम्नीबिड इंडिया द्वारा 100% एस्क्रो सुरक्षित",
    zero_dispute: "शून्य विवाद गारंटी · जीएसटी नियम 46 अनुपालित",
    l1_leader: "L1 न्यूनतम सत्यापित बोली",
    place_bid: "रिवर्स बोली लगाएं",
    two_envelope: "दो-लिफाफा तकनीकी और वित्तीय सीलबंद बोली",
    milestone_payout: "माइलस्टोन-आधारित एस्क्रो भुगतान",
    verified_contractor: "डिजिलॉकर और जीएसटी सत्यापित ठेकेदार",
  },
  te: {
    browse: "బ్రౌజ్ చేయండి",
    post_problem: "సమస్య పోస్ట్ చేయండి",
    analytics: "విశ్లేషణలు",
    market: "మార్కెట్",
    login: "లాగిన్",
    join_free: "ఉచితంగా చేరండి",
    logout: "లాగ్ అవుట్",
    tagline: "భారత రివర్స్-వేలం సేకరణ మార్కెట్‌ప్లేస్",
    escrow_guarantee: "ఓమ్నీబిడ్ ఇండియా ద్వారా 100% ఎస్క్రో రక్షితం",
    zero_dispute: "సున్నా వివాదాల హామీ · జీఎస్టీ రూల్ 46 అనుకూలం",
    l1_leader: "L1 అతి తక్కువ ఆమోదిత వేలం",
    place_bid: "రివర్స్ వేలం వేయండి",
    two_envelope: "రెండు-కవర్ల సాంకేతిక & ఆర్థిక సీల్డ్ బిడ్డింగ్",
    milestone_payout: "మైలురాళ్ల ఆధారిత ఎస్క్రో నిధుల విడుదల",
    verified_contractor: "డిజిలాకర్ & జీఎస్టీ ధృవీకరించబడిన కాంట్రాక్టర్",
  },
};

const I18nContext = createContext<I18nContextType>({
  language: "en",
  setLanguage: () => {},
  t: (key: string) => key,
});

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<SupportedLanguage>(() => {
    const saved = localStorage.getItem("omnibid_lang") as SupportedLanguage;
    return saved === "hi" || saved === "te" ? saved : "en";
  });

  const setLanguage = (lang: SupportedLanguage) => {
    setLanguageState(lang);
    localStorage.setItem("omnibid_lang", lang);
  };

  const t = (key: string): string => {
    return TRANSLATIONS[language]?.[key] || TRANSLATIONS.en[key] || key;
  };

  return (
    <I18nContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </I18nContext.Provider>
  );
};

export const useI18n = () => useContext(I18nContext);

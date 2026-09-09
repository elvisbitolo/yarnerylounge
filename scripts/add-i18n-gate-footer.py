import json

KEYS = {
    "en": {
        "gate": {"eyebrow": "The velvet ropes are up", "title": "Christa's Secret Swipe Speakeasy", "subtitle": "The password is a single word. If you know, you know.", "placeholder": "Give the password…", "enter": "Enter the Lounge", "error": "That's not the password. Try again.", "back": "Back to the front door"},
        "footer": {"tagline": "The exclusive, 24/7 global video hideaway built entirely for crafters.", "newsletterPlaceholder": "your@email.com", "newsletterBtn": "Stay Stitched", "company": "Company", "about": "About Me", "contact": "Contact Me", "guidelines": "Community Guidelines", "legal": "Legal", "terms": "Terms of Service", "privacy": "Privacy Policy", "refund": "Refund Policy", "shipping": "Shipping", "house": "The Speakeasy", "houseRules": "House Rules", "leaderboard": "Leaderboard", "explore": "Explore", "companyName": "The Secret Yarnery Ltd.", "vat": "VAT# 480 2741 96", "poweredBy": "Powered by Secret Yarnery"},
        "houseRules": {"eyebrow": "House Rules", "title": "The Zero-Red-Flag Policy", "intro": "We protect our speakeasy vibe fiercely.", "rules": ["No bullying, no negativity — ever.", "No unsolicited self-promotion or selling.", "Respect every crafter, every skill level, every fiber choice.", "Keep your account yours — no sharing, no shady business."], "consequence": "Violation results in an immediate lifetime ban with zero refunds. We keep this space safe, warm, and welcoming for everyone.", "pledge": "By entering Christa's Secret Swipe Speakeasy, you agree to keep the vibe cozy and the stitches kind."},
    },
    "fr": {
        "gate": {"eyebrow": "Les cordons de velours sont levés", "title": "Le Speakeasy Secret de Christa", "subtitle": "Le mot de passe est un seul mot. Si vous savez, vous savez.", "placeholder": "Donnez le mot de passe…", "enter": "Entrer dans le Salon", "error": "Ce n'est pas le mot de passe. Réessayez.", "back": "Retour à la porte d'entrée"},
        "footer": {"tagline": "Le refuge vidéo mondial 24h/24, réservé aux créatrices.", "newsletterPlaceholder": "votre@email.com", "newsletterBtn": "Restez Connectée", "company": "Entreprise", "about": "À propos", "contact": "Contact", "guidelines": "Règles communautaires", "legal": "Mentions légales", "terms": "Conditions d'utilisation", "privacy": "Politique de confidentialité", "refund": "Politique de remboursement", "shipping": "Livraison", "house": "Le Speakeasy", "houseRules": "Règles de la maison", "leaderboard": "Classement", "explore": "Explorer", "companyName": "The Secret Yarnery Ltd.", "vat": "TVA# 480 2741 96", "poweredBy": "Propulsé par Secret Yarnery"},
        "houseRules": {"eyebrow": "Règles de la maison", "title": "La Politique Zéro Drapeau Rouge", "intro": "Nous protégeons férocement l'ambiance de notre speakeasy.", "rules": ["Aucune intimidation, aucune négativité — jamais.", "Pas d'autopromotion ni de vente sollicitées.", "Respectez chaque créatrice, chaque niveau, chaque choix de fibre.", "Gardez votre compte pour vous — pas de partage."], "consequence": "La violation entraîne une interdiction immédiate et permanente sans remboursement.", "pledge": "En entrant dans le Speakeasy Secret de Christa, vous acceptez de garder l'ambiance chaleureuse."},
    },
    "de": {
        "gate": {"eyebrow": "Die Samtkordeln sind oben", "title": "Christas Geheimes Swipe-Speakeasy", "subtitle": "Das Passwort ist ein einziges Wort. Wer weiß, weiß es.", "placeholder": "Passwort eingeben…", "enter": "Den Salon betreten", "error": "Das ist nicht das Passwort. Versuche es erneut.", "back": "Zurück zur Haustür"},
        "footer": {"tagline": "Das exklusive, rund um die Uhr laufende globale Video-Refugium für Handarbeiterinnen.", "newsletterPlaceholder": "deine@email.com", "newsletterBtn": "Verbunden bleiben", "company": "Unternehmen", "about": "Über uns", "contact": "Kontakt", "guidelines": "Community-Richtlinien", "legal": "Rechtliches", "terms": "Nutzungsbedingungen", "privacy": "Datenschutz", "refund": "Rückgaberichtlinie", "shipping": "Versand", "house": "Das Speakeasy", "houseRules": "Hausregeln", "leaderboard": "Bestenliste", "explore": "Entdecken", "companyName": "The Secret Yarnery Ltd.", "vat": "USt-IdNr. 480 2741 96", "poweredBy": "Betrieben von Secret Yarnery"},
        "houseRules": {"eyebrow": "Hausregeln", "title": "Die Null-Rote-Flagge-Politik", "intro": "Wir schützen die Atmosphäre unseres Speakeasys mit Härte.", "rules": ["Keine Einschüchterung, keine Negativität — nie.", "Keine unaufgeforderte Eigenwerbung oder Verkauf.", "Respektiere jede Handarbeiterin, jedes Können, jede Faserwahl.", "Behalte dein Konto für dich — kein Teilen."], "consequence": "Ein Verstoß führt zu einem sofortigen lebenslangen Ausschluss ohne Rückerstattung.", "pledge": "Mit dem Betreten von Christas Secret Swipe Speakeasy erklärst du dich damit einverstanden, die Atmosphäre gemütlich zu halten."},
    },
}

for loc, k in KEYS.items():
    p = f"messages/{loc}.json"
    with open(p, encoding="utf-8") as f:
        d = json.load(f)
    d.update(k)
    with open(p, "w", encoding="utf-8") as f:
        json.dump(d, f, indent=0, ensure_ascii=False)
    print(loc, "OK")

// Moteur d'analyse de l'appli : nombres, notes, barème, coefficient, classes, commandes.
// Tout se passe dans le téléphone : rien n'est envoyé nulle part.
(function (root) {
  "use strict";

  // ---------- Mots ----------
  const UNITES = {
    "zéro": 0, "un": 1, "une": 1, "deux": 2, "trois": 3, "quatre": 4, "cinq": 5, "six": 6,
    "sept": 7, "huit": 8, "neuf": 9, "dix": 10, "onze": 11, "douze": 12, "treize": 13,
    "quatorze": 14, "quinze": 15, "seize": 16
  };
  const DIZAINES = { "vingt": 20, "trente": 30, "quarante": 40, "cinquante": 50, "soixante": 60 };
  const MOTS_NOMBRES = [...Object.keys(UNITES), ...Object.keys(DIZAINES), "vingts", "cent", "et",
    // formes à trait d'union, au cas où le modèle les connaît comme un seul mot
    "dix-sept", "dix-huit", "dix-neuf", "quatre-vingt", "quatre-vingts", "soixante-dix", "quatre-vingt-dix"];

  // Noms des lettres, plusieurs variantes : le modèle ne garde que celles qu'il connaît.
  const LETTRES = {
    a: ["a"], b: ["bé", "b"], c: ["cé", "c"], d: ["dé", "d"], e: ["e", "eu"], f: ["effe", "f"],
    g: ["gé", "g"], h: ["hache"], i: ["i"], j: ["ji", "j"], k: ["ka", "k"], l: ["elle", "l"],
    m: ["emme", "aime", "m"], n: ["enne", "haine", "n"], o: ["o", "eau"], p: ["pé", "p"],
    q: ["cu", "q"], r: ["erre", "r"], s: ["esse", "s"], t: ["té", "t"], u: ["u"], v: ["vé", "v"],
    w: ["double vé"], x: ["ixe", "x"], y: ["i grec"], z: ["zède", "z"]
  };
  const NIVEAUX = {
    "6": [["sixième"], ["six"]], "5": [["cinquième"], ["cinq"]],
    "4": [["quatrième"], ["quatre"]], "3": [["troisième"], ["trois"]]
  };
  const MOTS_NOTES = ["virgule", "et", "demi", "quart", "quarts", "absent", "absente", "non", "rendu", "noté"];
  const MOTS_COMMANDES = ["annule", "pause", "reprends", "remplace", "manquants", "manquant", "exporter",
    "nouvelle", "évaluation", "dernière", "liste", "des", "évaluations", "classe"];
  const MOTS_DIALOGUE = ["sur", "coefficient", "oui", "non", "annule", "virgule", "et", "demi"];

  function normaliser(s) {
    return String(s || "").toLowerCase().normalize("NFC").replace(/[-'’.,;:!?]/g, " ").replace(/\s+/g, " ").trim();
  }
  function mots(s) { return normaliser(s).split(" ").filter(Boolean); }

  // ---------- Nombres entiers de 0 à 100 ----------
  // Lit un entier à partir de tokens[i]. Renvoie { n, long } ou null. Les traits d'union
  // ont déjà été remplacés par des espaces.
  function entierA(t, i) {
    const a = t[i];
    if (a === undefined) return null;
    if (a === "cent") return { n: 100, long: 1 };
    // quatre-vingt(s) …
    if (a === "quatre" && (t[i + 1] === "vingt" || t[i + 1] === "vingts")) {
      let n = 80, long = 2;
      const r = petitA(t, i + 2, true);
      if (r && r.n >= 1 && r.n <= 19) { n += r.n; long += r.long; }
      return { n, long };
    }
    if (a in DIZAINES) {
      let n = DIZAINES[a], long = 1;
      if (t[i + 1] === "et" && (t[i + 2] === "un" || t[i + 2] === "une")) return { n: n + 1, long: 3 };
      if (a === "soixante" && t[i + 1] === "et" && t[i + 2] === "onze") return { n: 71, long: 3 };
      const r = petitA(t, i + 1, a === "soixante");
      // « vingt trois quarts » = 20,75, pas 23
      const quarts = r && r.n === 3 && r.long === 1 && /^quarts?$/.test(t[i + 2] || "");
      if (r && !quarts && r.n >= 1 && r.n <= (a === "soixante" ? 19 : 9)) { n += r.n; long += r.long; }
      return { n, long };
    }
    return petitA(t, i, true);
  }
  // 0 à 19 (avec « dix sept »… si avecDix)
  function petitA(t, i, avecDix) {
    const a = t[i];
    if (!(a in UNITES)) return null;
    const n = UNITES[a];
    if (avecDix && n === 10 && ["sept", "huit", "neuf"].includes(t[i + 1])) return { n: 10 + UNITES[t[i + 1]], long: 2 };
    return { n, long: 1 };
  }
  function estMotNombre(m) { return m in UNITES || m in DIZAINES || m === "cent" || m === "vingts"; }

  // Mots nécessaires pour dire tous les entiers de 0 à max.
  function motsJusqua(max) {
    const s = new Set();
    for (let n = 0; n <= max; n++) enMots(n).split(" ").forEach(m => s.add(m));
    return [...s];
  }
  // Entier en lettres (pour la grammaire et la voix).
  function enMots(n) {
    const u = ["zéro", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf", "dix", "onze", "douze", "treize", "quatorze", "quinze", "seize"];
    if (n <= 16) return u[n];
    if (n < 20) return "dix " + u[n - 10];
    if (n === 100) return "cent";
    const d = { 2: "vingt", 3: "trente", 4: "quarante", 5: "cinquante", 6: "soixante" };
    if (n < 70) { const q = Math.floor(n / 10), r = n % 10; return d[q] + (r === 0 ? "" : r === 1 ? " et un" : " " + u[r]); }
    if (n < 80) return n === 71 ? "soixante et onze" : "soixante " + enMots(n - 60);
    return n === 80 ? "quatre vingts" : "quatre vingt " + enMots(n - 80);
  }

  // ---------- Notes ----------
  // Lit une note (au quart de point) à tokens[i]. Renvoie { valeur, long } ou { erreur, long } ou null.
  function noteA(t, i) {
    const a = t[i];
    if (a === "absent" || a === "absente") return { valeur: "A", long: 1 };
    if (a === "non" && t[i + 1] === "rendu") return { valeur: "R", long: 2 };
    if (a === "non" && t[i + 1] === "noté") return { valeur: "N", long: 2 };
    const e = entierA(t, i);
    if (!e) return null;
    let n = e.n, long = e.long;
    const s = t[i + long];
    if (s === "virgule") {
      const d = entierA(t, i + long + 1);
      if (!d) return { erreur: "décimale manquante", long: long + 1 };
      const frac = { 5: 0.5, 50: 0.5, 25: 0.25, 75: 0.75 }[d.n];
      if (frac === undefined) return { erreur: "décimale non autorisée (quarts de point seulement)", long: long + 1 + d.long };
      return { valeur: n + frac, long: long + 1 + d.long };
    }
    const et = s === "et" ? 1 : 0;
    const s2 = t[i + long + et];
    if (s2 === "demi") return { valeur: n + 0.5, long: long + et + 1 };
    if (s2 === "quart") return { valeur: n + 0.25, long: long + et + 1 };
    if (s2 === "trois" && (t[i + long + et + 1] === "quarts" || t[i + long + et + 1] === "quart")) return { valeur: n + 0.75, long: long + et + 2 };
    return { valeur: n, long };
  }

  // ---------- Barème et coefficient (dialogue) ----------
  function lireBareme(texte) {
    const t = mots(texte);
    let i = t[0] === "sur" ? 1 : 0;
    const e = entierA(t, i);
    if (!e || i + e.long !== t.length || e.n < 1 || e.n > 100) return null;
    return e.n;
  }
  function lireCoef(texte) {
    const t = mots(texte);
    let i = t[0] === "coefficient" ? 1 : 0;
    const e = entierA(t, i);
    if (!e) return null;
    let v = e.n, j = i + e.long;
    // « un demi » = 0,5 ; « un et demi » = 1,5 ; « deux demi » = 2,5 (le « et » est souvent avalé)
    if (e.n === 1 && e.long === 1 && (t[j] === "demi" || t[j] === "demie") && j + 1 === t.length) return 0.5;
    // « zéro cinq » = 0,5 (le « virgule » est souvent avalé)
    if (e.n === 0 && t[j] in UNITES && UNITES[t[j]] >= 1 && UNITES[t[j]] <= 9 && j + 1 === t.length) return UNITES[t[j]] / 10;
    if (t[j] === "virgule") {
      const d = petitA(t, j + 1, false);
      if (!d || d.n > 9) return null;
      v += d.n / 10; j += 2;
    } else if (t[j] === "et" && t[j + 1] === "demi") { v += 0.5; j += 2; }
    else if (t[j] === "demi" || t[j] === "demie") { v += 0.5; j += 1; }
    if (j !== t.length) return null;
    v = Math.round(v * 10) / 10;
    if (v < 0.1 || v > 10) return null;
    return v;
  }
  function lireOuiNon(texte) {
    const t = mots(texte);
    if (t.includes("annule")) return "annule";
    if (t.includes("oui")) return "oui";
    if (t.includes("non")) return "non";
    return null;
  }

  // ---------- Élèves ----------
  // Clé « Léo B. » → prénom « Léo », initiale « b ».
  function decouperCle(cle) {
    const m = String(cle).trim().match(/^(.*\S)\s+([A-Za-zÀ-ÿ])\.?$/);
    if (m) return { prenom: m[1], initiale: m[2].toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "") };
    return { prenom: String(cle).trim(), initiale: null };
  }
  // Prépare les façons de dire chaque élève d'une classe.
  // eleves : [{ cle, alias: [] }] → [{ cle, formes: [[mots]], homonyme }]
  function preparerEleves(eleves) {
    const parPrenom = {};
    for (const e of eleves) { const p = normaliser(decouperCle(e.cle).prenom); parPrenom[p] = (parPrenom[p] || 0) + 1; }
    const res = eleves.map(e => {
      const { prenom, initiale } = decouperCle(e.cle);
      const mp = motsPrenom(prenom);
      const p = mp.mots;
      const homonyme = parPrenom[normaliser(prenom)] > 1;
      const formes = [];
      if (!homonyme) formes.push(p);
      if (initiale && LETTRES[initiale]) for (const l of LETTRES[initiale]) formes.push([...p, ...l.split(" ")]);
      for (const a of e.alias || []) { const m = mots(a); if (m.length) formes.push(m); }
      const aApprendre = mp.inconnu && !(e.alias || []).length;
      return { cle: e.cle, prenom, formes, homonyme, alias: e.alias || [], aApprendre };
    });
    // Mots propres d'un alias (« van » pour « et van ») : suffisent s'ils n'appartiennent qu'à lui.
    const base = new Set([...MOTS_NOMBRES, ...MOTS_NOTES, ...MOTS_COMMANDES]);
    for (const e of res) {
      const autres = new Set();
      for (const x of res) if (x !== e) x.formes.forEach(f => f.forEach(m => autres.add(m)));
      for (const a of e.alias) {
        const f = mots(a);
        if (f.length < 2) continue;
        for (const m of f) if (!base.has(m) && !autres.has(m)) e.formes.push([m]);
      }
    }
    return res;
  }
  // Prénoms partagés : on les reconnaît seuls pour pouvoir dire « précise l'initiale ».
  function prenomsHomonymes(prep) {
    const s = {};
    for (const e of prep) if (e.homonyme) s[normaliser(e.prenom)] = motsPrenom(e.prenom).mots;
    return Object.values(s);
  }

  // ---------- Lexique du modèle ----------
  // Liste des mots connus du modèle Vosk (chargée par la page). Sert à repérer les prénoms inconnus.
  let lexique = null;
  function definirLexique(set) { lexique = set; }
  function sansAccent(m) { return m.normalize("NFD").replace(/[\u0300-\u036f]/g, "").normalize("NFC"); }
  // Mots du prénom tels que le modèle peut les entendre. inconnu = true si un mot reste inconnu.
  function motsPrenom(prenom) {
    const res = [];
    let inconnu = false;
    for (const m of mots(prenom)) {
      if (!lexique || lexique.has(m)) { res.push(m); continue; }
      const s = sansAccent(m);
      if (lexique.has(s)) { res.push(s); continue; }   // « évan » inconnu, « evan » connu
      res.push(m); inconnu = true;
    }
    return { mots: res, inconnu };
  }

  function correspond(t, i, f) { return f.every((m, k) => t[i + k] === m); }
  function eleveA(t, i, prep) {
    let best = null;
    for (const e of prep) for (const f of e.formes) {
      if (correspond(t, i, f) && (!best || f.length > best.long)) best = { eleve: e, long: f.length };
    }
    return best;
  }

  // ---------- Classes ----------
  // « 5B » → [["cinquième","bé"],["cinquième","b"],["cinq","bé"],…]. Renvoie [] si imprononçable.
  function formesClasse(nom) {
    const m = String(nom).trim().match(/^([3-6])\s*(?:e|è|ème|eme|ième)?\s*[-_ ]?\s*([A-Za-z]|\d{1,2})$/i);
    if (!m) return [];
    const niv = NIVEAUX[m[1]], suite = m[2];
    let suites;
    if (/^\d+$/.test(suite)) suites = [enMots(+suite).split(" ")];
    else suites = (LETTRES[suite.toLowerCase()] || []).map(l => l.split(" "));
    const res = [];
    for (const n of niv) for (const s of suites) res.push([...n, ...s]);
    return res;
  }
  function classeA(t, i, classes) {
    let best = null;
    for (const c of classes) for (const f of formesClasse(c)) {
      if (correspond(t, i, f) && (!best || f.length > best.long)) best = { nom: c, long: f.length };
    }
    return best;
  }

  // ---------- Grammaires pour Vosk ----------
  function grammaireNotes(prep, bareme, classes) {
    // « cent » et « vingts » seulement si le barème le demande : sinon ils captent des mots mal entendus.
    const s = new Set([...MOTS_NOTES, ...MOTS_COMMANDES, ...motsJusqua(Math.max(10, bareme))]);
    prep.forEach(e => e.formes.forEach(f => f.forEach(m => s.add(m))));
    prenomsHomonymes(prep).forEach(f => f.forEach(m => s.add(m)));
    classes.forEach(c => formesClasse(c).forEach(f => f.forEach(m => s.add(m))));
    return [...s];
  }
  function grammaireNavigation(classes) {
    const s = new Set([...MOTS_COMMANDES, ...motsJusqua(20)]);
    classes.forEach(c => formesClasse(c).forEach(f => f.forEach(m => s.add(m))));
    return [...s];
  }
  function grammaireDialogue() {
    return [...new Set([...MOTS_DIALOGUE, ...motsJusqua(100), "cent", "vingts", "dix-sept", "dix-huit", "dix-neuf"])];
  }

  // ---------- Analyse d'une phrase en mode saisie ----------
  // ctx : { prep (élèves préparés ou []), bareme (ou null si pas d'évaluation), classes: [noms] }
  // Renvoie une liste d'actions :
  //  { type:"note", cle, valeur } | { type:"commande", nom, arg? } | { type:"refus", raison, texte, suite? }
  function analyser(texte, ctx) {
    const t = mots(texte);
    const prep = ctx.prep || [];
    const homos = prenomsHomonymes(prep);
    const actions = [];
    let i = 0;
    while (i < t.length) {
      const a = t[i], b = t[i + 1];
      // commandes à plusieurs mots
      if (a === "manquants" || a === "manquant") { actions.push({ type: "commande", nom: "manquants" }); i += 1; continue; }
      if (a === "nouvelle" && b === "évaluation") { actions.push({ type: "commande", nom: "nouvelle évaluation" }); i += 2; continue; }
      if (a === "liste" && b === "des" && t[i + 2] === "évaluations") { actions.push({ type: "commande", nom: "liste des évaluations" }); i += 3; continue; }
      if (a === "dernière" && b === "évaluation") { actions.push({ type: "commande", nom: "évaluation", arg: "dernière" }); i += 2; continue; }
      if (a === "évaluation") {
        const e = entierA(t, i + 1);
        if (e) { actions.push({ type: "commande", nom: "évaluation", arg: e.n }); i += 1 + e.long; continue; }
        actions.push({ type: "refus", raison: "numéro d'évaluation manquant", texte: a }); i++; continue;
      }
      if (a === "classe") {
        const c = classeA(t, i + 1, ctx.classes || []);
        if (c) { actions.push({ type: "commande", nom: "classe", arg: c.nom }); i += 1 + c.long; continue; }
        let j = i + 1; while (j < t.length && !["classe", "évaluation"].includes(t[j])) j++;
        actions.push({ type: "refus", raison: "classe non reconnue", texte: t.slice(i, j).join(" ") }); i = j; continue;
      }
      if (["annule", "pause", "reprends", "remplace", "exporter"].includes(a)) { actions.push({ type: "commande", nom: a }); i++; continue; }

      const el = eleveA(t, i, prep);
      if (el) {
        if (ctx.bareme == null) { actions.push({ type: "refus", raison: "aucune évaluation choisie", texte: t.slice(i).join(" ") }); break; }
        const note = noteA(t, i + el.long);
        if (!note) {
          const enFin = i + el.long >= t.length;
          actions.push({ type: "refus", raison: "note manquante", texte: el.eleve.cle, suite: enFin ? t.slice(i).join(" ") : null });
          i += el.long; continue;
        }
        if (note.erreur) {
          actions.push({ type: "refus", raison: note.erreur, texte: t.slice(i, i + el.long + note.long).join(" ") });
          i += el.long + note.long; continue;
        }
        const fin0 = i + el.long + note.long;
        if (estMotNombre(t[fin0])) {
          let fin = fin0; while (estMotNombre(t[fin])) fin++;
          actions.push({ type: "refus", raison: "note ambiguë", texte: t.slice(i, fin).join(" ") });
          i = fin; continue;
        }
        if (typeof note.valeur === "number" && note.valeur > ctx.bareme) {
          actions.push({ type: "refus", raison: "au-dessus du barème", texte: el.eleve.cle + " " + formater(note.valeur) });
        } else actions.push({ type: "note", cle: el.eleve.cle, valeur: note.valeur });
        i = fin0; continue;
      }
      const h = homos.find(f => correspond(t, i, f));
      if (h) {
        let j = i + h.length; while (j < t.length && (estMotNombre(t[j]) || MOTS_NOTES.includes(t[j]))) j++;
        actions.push({ type: "refus", raison: "plusieurs élèves portent ce prénom : précise l'initiale", texte: t.slice(i, j).join(" ") });
        i = j; continue;
      }
      i++;
    }
    if (!actions.length && t.length) actions.push({ type: "refus", raison: "rien de reconnu", texte: t.join(" ") });
    return actions;
  }

  function formater(v) { return typeof v === "number" ? String(v).replace(".", ",") : v; }
  function pourVoix(v) {
    if (v === "A") return "absent";
    if (v === "R") return "non rendu";
    if (v === "N") return "non noté";
    return String(v).replace(".", " virgule ");
  }

  root.Moteur = {
    normaliser, mots, entierA, noteA, enMots, motsJusqua, lireBareme, lireCoef, lireOuiNon,
    decouperCle, preparerEleves, formesClasse, analyser, formater, pourVoix,
    grammaireNotes, grammaireNavigation, grammaireDialogue, definirLexique, sansAccent
  };
})(typeof window !== "undefined" ? window : globalThis);

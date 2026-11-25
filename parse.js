// Analyse du texte reconnu par Vosk : prénom + note, ou commande.
// Aucune donnée n'est envoyée nulle part : tout se passe dans le téléphone.
(function (root) {
  const NOMBRES = {
    "zéro": 0, "un": 1, "une": 1, "deux": 2, "trois": 3, "quatre": 4, "cinq": 5,
    "six": 6, "sept": 7, "huit": 8, "neuf": 9, "dix": 10, "onze": 11, "douze": 12,
    "treize": 13, "quatorze": 14, "quinze": 15, "seize": 16, "dix-sept": 17,
    "dix-huit": 18, "dix-neuf": 19, "vingt": 20
  };
  const COMMANDES = ["annule", "pause", "reprends"];
  const AUTRES = ["virgule", "et", "demi", "absent", "absente", "non", "rendu", "noté"];

  function normaliser(s) {
    return s.toLowerCase().normalize("NFC").trim();
  }

  // eleves : [{ nom: "Naël", alias: ["na elle"] }]
  // Renvoie la liste des mots à donner à Vosk.
  function vocabulaire(eleves) {
    const mots = new Set([...Object.keys(NOMBRES), ...COMMANDES, ...AUTRES]);
    for (const e of eleves) {
      for (const forme of formes(e)) forme.forEach(m => mots.add(m));
    }
    return [...mots];
  }

  // Les façons de dire un élève : son prénom, puis ses alias, en listes de mots.
  function formes(e) {
    const f = [normaliser(e.nom).split(/\s+/)];
    for (const a of e.alias || []) {
      const mots = normaliser(a).split(/\s+/).filter(Boolean);
      if (mots.length) f.push(mots);
    }
    return f;
  }

  // Cherche un élève qui commence à la position i. Prend la forme la plus longue.
  function eleveA(tokens, i, eleves) {
    let meilleur = null;
    for (const e of eleves) {
      for (const f of formes(e)) {
        if (f.every((m, k) => tokens[i + k] === m)) {
          if (!meilleur || f.length > meilleur.long) meilleur = { eleve: e, long: f.length };
        }
      }
    }
    return meilleur;
  }

  // Lit une note à la position i. Renvoie { valeur, long } ou null.
  function noteA(tokens, i) {
    const t = tokens[i];
    if (t === "absent" || t === "absente") return { valeur: "A", long: 1 };
    if (t === "non" && tokens[i + 1] === "rendu") return { valeur: "R", long: 2 };
    if (t === "non" && tokens[i + 1] === "noté") return { valeur: "N", long: 2 };
    if (!(t in NOMBRES)) return null;
    let n = NOMBRES[t], long = 1;
    // « dix sept » en deux mots
    if (n === 10 && ["sept", "huit", "neuf"].includes(tokens[i + 1])) {
      n += NOMBRES[tokens[i + 1]]; long = 2;
    }
    const s = tokens[i + long];
    if (s === "virgule" && tokens[i + long + 1] in NOMBRES && NOMBRES[tokens[i + long + 1]] <= 9) {
      n += NOMBRES[tokens[i + long + 1]] / 10; long += 2;
    } else if (s === "et" && tokens[i + long + 1] === "demi") {
      n += 0.5; long += 2;
    }
    return { valeur: n, long };
  }

  // Analyse une phrase. Renvoie une liste d'actions :
  // { type: "note", eleve, valeur } | { type: "commande", nom }
  // | { type: "refus", raison, texte }
  function analyser(texte, eleves, bareme) {
    const tokens = normaliser(texte).split(/\s+/).filter(Boolean);
    const actions = [];
    let i = 0, ignores = [];
    while (i < tokens.length) {
      const t = tokens[i];
      if (COMMANDES.includes(t)) { actions.push({ type: "commande", nom: t }); i++; continue; }
      const el = eleveA(tokens, i, eleves);
      if (el) {
        const note = noteA(tokens, i + el.long);
        if (!note) {
          actions.push({ type: "refus", raison: "note manquante", texte: el.eleve.nom });
          i += el.long; continue;
        }
        const suivant = tokens[i + el.long + note.long];
        if (suivant in NOMBRES) {
          // « vingt deux », « seize six »… : on ne devine pas, on fait répéter.
          let fin = i + el.long + note.long;
          while (tokens[fin] in NOMBRES) fin++;
          actions.push({ type: "refus", raison: "note ambiguë", texte: tokens.slice(i, fin).join(" ") });
          i = fin; continue;
        }
        if (typeof note.valeur === "number" && note.valeur > bareme) {
          actions.push({ type: "refus", raison: "au-dessus du barème", texte: el.eleve.nom + " " + note.valeur });
        } else {
          actions.push({ type: "note", eleve: el.eleve.nom, valeur: note.valeur });
        }
        i += el.long + note.long; continue;
      }
      ignores.push(t); i++;
    }
    if (!actions.length && tokens.length) {
      actions.push({ type: "refus", raison: "pas de prénom reconnu", texte: tokens.join(" ") });
    }
    return actions;
  }

  function formater(v) {
    return typeof v === "number" ? String(v).replace(".", ",") : v;
  }

  root.Dictee = { vocabulaire, analyser, formater, normaliser };
})(typeof window !== "undefined" ? window : globalThis);

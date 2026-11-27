// Données de l'appli : import du fichier du trimestre, fusion, export Excel.
// Utilise la bibliothèque SheetJS (objet global XLSX). Rien n'est envoyé nulle part.
(function (root) {
  "use strict";

  function texte(v) { return v == null ? "" : String(v).trim(); }
  function norm(s) { return texte(s).toLowerCase().normalize("NFC"); }

  function etatVide() {
    return { version: 1, trimestre: "T1", colonne: null, classes: [], courant: { classe: null, eval: null } };
  }

  function lignes(ws) {
    return root.XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: true, defval: "", raw: false });
  }

  // Titres proposés à l'utilisateur : première ligne de la première feuille qui a au moins 2 cases remplies.
  function titresColonnes(wb) {
    const ws = wb.Sheets[wb.SheetNames[0]];
    const L = lignes(ws);
    for (let i = 0; i < Math.min(L.length, 15); i++) {
      const remplis = L[i].map(texte).filter(Boolean);
      if (remplis.length >= 2) return { feuille: wb.SheetNames[0], titres: [...new Set(remplis)] };
    }
    return { feuille: wb.SheetNames[0], titres: [] };
  }

  // Lit, dans chaque feuille, la colonne dont le titre est `titre`.
  // Renvoie { listes: [{ nom, cles, doublons }], ignorees: [noms de feuilles sans cette colonne] }
  function extraireListes(wb, titre) {
    const listes = [], ignorees = [];
    for (const nom of wb.SheetNames) {
      const L = lignes(wb.Sheets[nom]);
      let li = -1, col = -1;
      for (let i = 0; i < Math.min(L.length, 15) && li < 0; i++) {
        const j = L[i].findIndex(c => norm(c) === norm(titre));
        if (j >= 0) { li = i; col = j; }
      }
      if (li < 0) { ignorees.push(nom); continue; }
      const cles = [], vus = new Set(), doublons = [];
      for (let i = li + 1; i < L.length; i++) {
        const v = texte(L[i][col]);
        if (!v) continue;
        if (vus.has(norm(v))) { doublons.push(v); continue; }
        vus.add(norm(v)); cles.push(v);
      }
      if (cles.length) listes.push({ nom: texte(nom), cles, doublons }); else ignorees.push(nom);
    }
    return { listes, ignorees };
  }

  // Fusionne les listes importées dans l'état. Classes reconnues par leur nom, élèves par leur clé.
  // Les notes déjà saisies sont gardées. Un élève absent de la nouvelle liste est marqué « parti »
  // (gardé en fin de liste, pour ne perdre aucune note).
  // remplacer = true : nouvelle colonne, on repart des listes du fichier (sans « partis »).
  function fusionner(etat, listes, trimestre, remplacer) {
    const bilan = [];
    if (trimestre) etat.trimestre = trimestre;
    for (const l of listes) {
      let c = etat.classes.find(x => norm(x.nom) === norm(l.nom));
      const nouvelle = !c;
      if (!c) { c = { nom: l.nom, eleves: [], evals: [] }; etat.classes.push(c); }
      const anciens = new Map((remplacer ? [] : c.eleves).map(e => [norm(e.cle), e]));
      const eleves = l.cles.map(cle => {
        const a = anciens.get(norm(cle));
        anciens.delete(norm(cle));
        return a ? { cle: a.cle, alias: a.alias || [] } : { cle, alias: [] };
      });
      const ajoutes = remplacer ? 0 : l.cles.filter(cle => !c.eleves.some(e => norm(e.cle) === norm(cle))).length;
      const partis = [...anciens.values()].map(e => ({ ...e, parti: true }));
      c.eleves = [...eleves, ...partis];
      bilan.push({ nom: c.nom, nouvelle, eleves: eleves.length, ajoutes: nouvelle ? 0 : ajoutes, partis: partis.length, doublons: l.doublons });
    }
    return bilan;
  }

  function enteteEval(ev) {
    return `${ev.desc} /${String(ev.bareme).replace(".", ",")} coef ${String(ev.coef).replace(".", ",")}`;
  }

  // Classeur d'export : une feuille par classe, une ligne par élève, une colonne par évaluation.
  function construireClasseur(etat) {
    const X = root.XLSX;
    const wb = X.utils.book_new();
    for (const c of etat.classes) {
      const entetes = ["Clé", ...c.evals.map(enteteEval)];
      const vus = {};
      const ent = entetes.map(h => { vus[h] = (vus[h] || 0) + 1; return vus[h] > 1 ? `${h} (${vus[h]})` : h; });
      const rows = [ent];
      for (const e of c.eleves) {
        rows.push([e.cle, ...c.evals.map(ev => {
          const v = ev.notes[e.cle];
          return v === undefined ? null : v;
        })]);
      }
      const ws = X.utils.aoa_to_sheet(rows);
      ws["!cols"] = [{ wch: 16 }, ...c.evals.map(() => ({ wch: 22 }))];
      X.utils.book_append_sheet(wb, ws, c.nom.slice(0, 31));
    }
    if (!etat.classes.length) X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet([["Aucune classe"]]), "Vide");
    return wb;
  }

  function deux(n) { return String(n).padStart(2, "0"); }
  function nomFichier(etat, d) {
    d = d || new Date();
    return `notes_${etat.trimestre}_${d.getFullYear()}-${deux(d.getMonth() + 1)}-${deux(d.getDate())}_${deux(d.getHours())}${deux(d.getMinutes())}.xlsx`;
  }

  root.Donnees = { etatVide, titresColonnes, extraireListes, fusionner, construireClasseur, nomFichier, enteteEval };
})(typeof window !== "undefined" ? window : globalThis);

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

  // ---------- Fichier CSV de pseudos ----------
  // Format : ligne 1 = noms des classes (une colonne par classe), puis un pseudo par case.
  // Point-virgule (ou virgule, ou tabulation), UTF-8 avec ou sans BOM ; à défaut Windows-1252.
  function decoderTexte(octets) {
    let t = new TextDecoder("utf-8").decode(octets);
    if (t.includes("�")) { try { t = new TextDecoder("windows-1252").decode(octets); } catch (e) {} }
    return t.replace(/^﻿/, "");
  }
  function decouperCsv(t) {
    const premiere = t.split(/\r?\n/)[0] || "";
    const nb = s => premiere.split(s).length - 1;
    const sep = [";", "\t", ","].reduce((a, b) => nb(b) > nb(a) ? b : a, ";");
    const L = []; let ligne = [], cel = "", guill = false;
    for (let i = 0; i < t.length; i++) {
      const ch = t[i];
      if (guill) {
        if (ch === '"') { if (t[i + 1] === '"') { cel += '"'; i++; } else guill = false; }
        else cel += ch;
      } else if (ch === '"' && cel === "") guill = true;
      else if (ch === sep) { ligne.push(cel); cel = ""; }
      else if (ch === "\n" || ch === "\r") {
        if (ch === "\r" && t[i + 1] === "\n") i++;
        ligne.push(cel); L.push(ligne); ligne = []; cel = "";
      } else cel += ch;
    }
    if (cel !== "" || ligne.length) { ligne.push(cel); L.push(ligne); }
    return L;
  }
  // Renvoie { listes: [{ nom, cles, doublons }], ignorees: [] } comme extraireListes.
  function listesCsv(texteCsv) {
    const L = decouperCsv(texteCsv).filter(l => l.some(c => texte(c)));
    if (!L.length) return { listes: [], ignorees: [] };
    const tete = L[0].map(texte);
    const listes = [], ignorees = [];
    tete.forEach((nom, j) => {
      if (!nom) return;
      const cles = [], vus = new Set(), doublons = [];
      for (let i = 1; i < L.length; i++) {
        const v = texte(L[i][j]);
        if (!v) continue;
        if (vus.has(norm(v))) { doublons.push(v); continue; }
        vus.add(norm(v)); cles.push(v);
      }
      if (cles.length) listes.push({ nom, cles, doublons }); else ignorees.push(nom);
    });
    return { listes, ignorees };
  }
  function estCsv(nomFichier, octets) {
    if (/\.(csv|txt)$/i.test(nomFichier || "")) return true;
    // Un .xlsx commence par « PK » (zip) ; un ancien .xls par D0 CF.
    return !(octets[0] === 0x50 && octets[1] === 0x4b) && !(octets[0] === 0xd0 && octets[1] === 0xcf);
  }

  function aDesNotes(c, cle) { return c.evals.some(ev => ev.notes && ev.notes[cle] !== undefined); }

  // Fusionne les listes importées dans l'état. Classes reconnues par leur nom, élèves par leur clé.
  // Les notes déjà saisies sont gardées. Un élève absent de la nouvelle liste est gardé en fin
  // de liste (« parti ») seulement s'il a au moins une note ; sinon il est retiré.
  // Une classe absente du fichier est retirée si elle n'a aucune note, sinon gardée (en fin).
  // Les classes suivent l'ordre du fichier.
  // remplacer = true : nouvelle colonne, on repart des listes du fichier (sans « partis »).
  function fusionner(etat, listes, trimestre, remplacer) {
    const bilan = [];
    if (trimestre) etat.trimestre = trimestre;
    const ordre = [];
    for (const l of listes) {
      let c = etat.classes.find(x => norm(x.nom) === norm(l.nom));
      const nouvelle = !c;
      if (!c) { c = { nom: l.nom, eleves: [], evals: [] }; etat.classes.push(c); }
      ordre.push(c);
      const anciens = new Map((remplacer ? [] : c.eleves).map(e => [norm(e.cle), e]));
      const eleves = l.cles.map(cle => {
        const a = anciens.get(norm(cle));
        anciens.delete(norm(cle));
        return a ? { cle: a.cle, alias: a.alias || [] } : { cle, alias: [] };
      });
      const ajoutes = remplacer ? 0 : l.cles.filter(cle => !c.eleves.some(e => norm(e.cle) === norm(cle))).length;
      const restes = [...anciens.values()];
      const partis = restes.filter(e => aDesNotes(c, e.cle)).map(e => ({ ...e, parti: true }));
      c.eleves = [...eleves, ...partis];
      bilan.push({ nom: c.nom, nouvelle, eleves: eleves.length, ajoutes: nouvelle ? 0 : ajoutes, partis: partis.length, retires: restes.length - partis.length, doublons: l.doublons });
    }
    const absentes = etat.classes.filter(c => !ordre.includes(c));
    const gardees = absentes.filter(c => c.eleves.some(e => aDesNotes(c, e.cle)));
    etat.classes = [...ordre, ...gardees];
    if (etat.courant && !etat.classes.some(c => c.nom === etat.courant.classe)) etat.courant = { classe: null, eval: null };
    bilan.gardees = gardees.map(c => c.nom);
    bilan.retirees = absentes.filter(c => !gardees.includes(c)).map(c => c.nom);
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

  // Export CSV pour Excel en français : un seul fichier, un bloc par classe
  // (ligne d'en-têtes « Classe;Clé;évaluations… », puis une ligne par élève, puis une ligne vide).
  // Point-virgule, virgule décimale, UTF-8 avec BOM pour les accents.
  function csvCellule(v) {
    if (v === undefined || v === null) return "";
    const s = typeof v === "number" ? String(v).replace(".", ",") : String(v);
    return /[;"\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function construireCsv(etat) {
    const lignes = [];
    for (const c of etat.classes) {
      lignes.push(["Classe", "Clé", ...c.evals.map(enteteEval)].map(csvCellule).join(";"));
      for (const e of c.eleves) lignes.push([c.nom, e.cle, ...c.evals.map(ev => ev.notes[e.cle])].map(csvCellule).join(";"));
      lignes.push("");
    }
    return "\uFEFF" + lignes.join("\r\n");
  }

  function deux(n) { return String(n).padStart(2, "0"); }
  function nomFichier(etat, d, ext) {
    d = d || new Date();
    return `notes_${etat.trimestre}_${d.getFullYear()}-${deux(d.getMonth() + 1)}-${deux(d.getDate())}_${deux(d.getHours())}${deux(d.getMinutes())}.${ext || "xlsx"}`;
  }

  root.Donnees = { etatVide, titresColonnes, extraireListes, fusionner, decoderTexte, decouperCsv, listesCsv, estCsv, aDesNotes, construireClasseur, construireCsv, nomFichier, enteteEval };
})(typeof window !== "undefined" ? window : globalThis);

# Programeta Premium

Programeta és una llibreta docent digital pensada per planificar l'horari setmanal, consultar l'any complet i generar un lliçonari a partir de totes les activitats programades.

Aquesta versió continua sent una aplicació estàtica compatible amb GitHub Pages, però incorpora una arquitectura i una experiència molt més properes a un producte final.

## Funcionalitats principals

### Horari setmanal

- Vista de dilluns a divendres amb franges configurables.
- Activitats puntuals per a una setmana concreta.
- Activitats recurrents amb data d'inici i finalització.
- Una activitat puntual substitueix visualment la recurrent en aquella setmana sense eliminar-la.
- Edició i eliminació de qualsevol activitat.
- Indicació de la setmana actual, dates reals i nombre d'activitats.
- Sincronització en temps real amb Firestore.

### Calendari anual

- Vista de totes les setmanes de l'any.
- Recompte d'activitats de cada setmana.
- Accés directe a qualsevol setmana.
- Indicació diferenciada de la setmana actual i de la seleccionada.

### Lliçonari

- No duplica dades: es genera directament des de l'horari.
- Filtre per curs, assignatura, text i rang de dates.
- Expansió de les activitats recurrents en totes les dates corresponents.
- Respecta les excepcions puntuals de cada setmana.
- Impressió optimitzada.
- Exportació CSV compatible amb Excel.

### Compte d'usuari

- Registre i inici de sessió amb correu i contrasenya.
- Sessió persistent al navegador.
- Recuperació de contrasenya per correu.
- Dades independents per usuari.
- Accés a les mateixes dades des de qualsevol dispositiu.

### Configuració i seguretat

- Dates del curs acadèmic configurables.
- Franges horàries configurables.
- Còpia de seguretat JSON.
- Restauració completa d'una còpia.
- Regles de Firestore limitades al propietari de cada espai.
- Interfície accessible, responsiva i preparada per imprimir.
- Manifest d'aplicació i service worker per instal·lar la interfície com a PWA.

## Estructura

```text
programeta-premium/
├── assets/
│   ├── icon-192.png
│   ├── icon-512.png
│   ├── logo-icon.png
│   ├── logo-icon.svg
│   └── logo-wordmark.svg
├── css/
│   └── style.css
├── data/
│   └── sample.json
├── js/
│   ├── app.firebase.js
│   ├── firebase.js
│   └── utils.js
├── firestore.rules
├── index.html
├── LICENSE
├── manifest.webmanifest
├── README.md
└── service-worker.js
```

## Posada en marxa

### 1. Copiar els fitxers

Substitueix el contingut del repositori actual pels fitxers d'aquesta versió. Els logos inclosos són funcionals; pots substituir-los pels teus mantenint els mateixos noms.

### 2. Revisar la configuració de Firebase

El fitxer `js/firebase.js` ja conté la configuració del projecte `programeta-cc218` que hi havia al prototip.

Comprova a Firebase Console:

1. **Authentication > Sign-in method**: activa `Email/Password`.
2. **Firestore Database**: comprova que la base de dades està creada.
3. **Firestore Database > Rules**: publica el contingut de `firestore.rules`.
4. **Authentication > Settings > Authorized domains**: comprova que hi consta `polroviraguilar.github.io`.

### 3. Publicar a GitHub Pages

1. Fes `git add .`.
2. Fes un commit, per exemple:

```bash
git commit -m "feat: premium Programeta release"
```

3. Puja els canvis:

```bash
git push origin main
```

4. A GitHub, ves a **Settings > Pages** i publica la branca `main`, carpeta `/root`.

## Compatibilitat amb les dades anteriors

La versió Premium manté la col·lecció:

```text
users/{uid}/horariSetmanal/{documentId}
```

També interpreta els camps antics:

- `dia`
- `hora`
- `curs`
- `assignatura`
- `activitat`
- `tipus`
- `setmana`
- `any`

Els documents nous afegeixen camps com `dateKey`, `dayIndex`, `startTime`, `endTime`, `activeFrom`, `activeUntil`, `notes` i `updatedAt`.

Les dades de la versió anònima anterior estaven vinculades a un UID anònim. Firebase no les associa automàticament al nou compte amb correu. Si cal recuperar-les, s'ha de fer una migració manual des de la consola de Firestore o mitjançant un script específic.

## Model de dades

### Activitat puntual

```json
{
  "dia": "dilluns",
  "dayIndex": 1,
  "hora": "09:00-10:00",
  "curs": "5è",
  "assignatura": "Música",
  "activitat": "Percussió corporal",
  "tipus": "ocasional",
  "any": 2026,
  "setmana": 39,
  "dateKey": "2026-09-21"
}
```

### Activitat recurrent

```json
{
  "dia": "dilluns",
  "dayIndex": 1,
  "hora": "09:00-10:00",
  "curs": "5è",
  "assignatura": "Música",
  "activitat": "Percussió corporal",
  "tipus": "permanent",
  "any": 0,
  "setmana": 0,
  "activeFrom": "2026-09-01",
  "activeUntil": "2027-06-30"
}
```

## Desenvolupament local

Els mòduls JavaScript no s'han d'obrir directament amb `file://`. Utilitza un servidor local:

```bash
python -m http.server 8080
```

Després obre:

```text
http://localhost:8080
```

Per fer proves locals amb Firebase Authentication, afegeix `localhost` als dominis autoritzats si no hi és.

## Notes de producció

- La configuració pública de Firebase del frontend no substitueix les regles de seguretat. La protecció real és `firestore.rules`.
- Abans d'una publicació comercial, cal afegir política de privacitat, condicions d'ús, gestió de consentiment i revisió de protecció de dades.
- Per a un volum elevat d'usuaris, convé migrar a un projecte amb build (`npm` + Vite) per aprofitar tree-shaking, proves automatitzades i control de versions de dependències.

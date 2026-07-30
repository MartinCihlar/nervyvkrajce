# Nervy v krajce — web

Statický web podcastu, který si nejnovější videa tahá sám z YouTube kanálu
[@nervyvkrajce](https://www.youtube.com/@nervyvkrajce/).

## Struktura

```
public/index.html   ← živý zdroj stránky (Claude Design formát: <x-dc>, {{ vazby }})
public/support.js   ← runtime z Claude Designu, needitovat
public/assets/      ← logo
api/episodes.js     ← serverless funkce: čte YouTube Data API, drží API klíč
vercel.json         ← statické public/ + nastavení funkce
```

Soubory v kořeni (`Nervy v krajce - web.dc.html`, `… (standalone).html`, `build/`)
jsou původní export z Claude Designu. Zůstávají jako záloha a na deploy nemají vliv.
**Editovat se má `public/index.html`.**

## Jak funguje načítání epizod

1. Stránka se vykreslí okamžitě se záložními daty (tmavé placeholdery karet).
2. `componentDidMount()` zavolá `/api/episodes`.
3. Funkce načte uploads playlist kanálu, doplní délky přes `videos.list`
   a rozdělí videa: nad 3 minuty = epizoda, do 3 minut = short.
4. Odpověď se cachuje na Vercel edge (`s-maxage=3600`), takže se YouTube API
   volá zhruba jednou za hodinu bez ohledu na návštěvnost.
5. Karty se překreslí na obrázkové náhledy z YouTube.

Když API selže, zůstanou záložní data a karty se vykreslí jako iframe na
N-té video z playlistu — stránka tedy i tak ukazuje reálná videa z kanálu.

Čísla epizod (`#21`) se počítají z pořadí: nejstarší = `#1`. Konstanta
`fallbackTotal` v `public/index.html` se použije jen v chybovém stavu.

## Nasazení na Vercel

### 1. API klíč

V [Google Cloud Console](https://console.cloud.google.com/) založ projekt,
v **APIs & Services → Library** zapni **YouTube Data API v3** a v **Credentials**
vytvoř **API key**. Klíč omez na YouTube Data API v3 (Application restrictions
nech na *None* — volá ho server, ne prohlížeč).

### 2. Deploy

```bash
npx vercel
```

Při prvním spuštění se přihlásíš a potvrdíš vytvoření projektu. Pak nastav klíč:

```bash
npx vercel env add YOUTUBE_API_KEY
```

Zadej hodnotu a vyber všechna tři prostředí (Production, Preview, Development).
Nasazení do produkce:

```bash
npx vercel --prod
```

Alternativně přes web: nahraj složku na GitHub a naimportuj repozitář na
[vercel.com/new](https://vercel.com/new). Framework preset nech na **Other**,
proměnnou `YOUTUBE_API_KEY` přidej v Settings → Environment Variables.

### 3. Ověření

Otevři `https://<projekt>.vercel.app/api/episodes` — musí vrátit JSON s klíči
`episodes`, `shorts` a `total`. Když vrátí chybu, je vidět v Vercel → Logs.

## Lokální vývoj

```bash
npx vercel dev
```

Potřebuje `.env.local` s `YOUTUBE_API_KEY` (viz `.env.example`).

Bez klíče a bez Node.js si můžeš aspoň prohlédnout vzhled — jakýkoli statický
server nad `public/`. `/api/episodes` sice selže, ale díky fallbacku se stránka
vykreslí s videi z playlistu.

## Co ještě čeká na doplnění

- Portréty v sekci „Kdo jsme" jsou pořád placeholdery (`portrét … — nahraj sem`).
  Nahraj obrázky do `public/assets/` a nahraď jimi šrafované boxy.
- `og:image` v hlavičce míří na logo relativní cestou. Náhledy odkazů na
  Facebooku a v chatech potřebují **absolutní** URL — po nasazení přepiš na
  `https://<tvoje-domena>/assets/og.png` a nahraj tam grafiku 1200×630.

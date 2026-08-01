// Přijímá formulář "Máš téma do epizody?" a přeposílá ho e-mailem přes Resend.
// API klíč zůstává na serveru; do prohlížeče se nikdy nedostane.

const PRIJEMCE = process.env.KONTAKT_PRIJEMCE || 'svatba@nervyvkrajce.cz';

// Resend povoluje posílat jen z ověřené domény. Než se nervyvkrajce.cz ověří,
// funguje onboarding@resend.dev, ale ten doručí pouze na adresu, kterou má
// účet Resendu zaregistrovanou.
const ODESILATEL = process.env.RESEND_ODESILATEL || 'Nervy v krajce <onboarding@resend.dev>';

const LIMITY = { jmeno: 100, email: 200, zprava: 4000 };

function ocisti(hodnota, maxDelka) {
  return String(hodnota == null ? '' : hodnota).trim().slice(0, maxDelka);
}

function jeEmail(hodnota) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(hodnota);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'Použij POST.' });
    return;
  }

  const klic = process.env.RESEND_API_KEY;
  if (!klic) {
    console.error('kontakt: chybí RESEND_API_KEY');
    res.status(500).json({ error: 'Formulář zatím není nastavený.' });
    return;
  }

  // Vercel tělo s application/json rozparsuje sám, ale při ručním volání
  // (curl bez hlavičky) může dorazit řetězec — ošetříme obojí
  let telo = req.body;
  if (typeof telo === 'string') {
    try {
      telo = JSON.parse(telo);
    } catch {
      telo = {};
    }
  }
  telo = telo || {};

  // Návnada na roboty: pole je pro lidi neviditelné, takže vyplněné znamená
  // spam. Tváříme se, že vše proběhlo, ať se robot nesnaží znovu.
  if (ocisti(telo.web, 50)) {
    res.status(200).json({ ok: true });
    return;
  }

  const jmeno = ocisti(telo.jmeno, LIMITY.jmeno);
  const email = ocisti(telo.email, LIMITY.email);
  const zprava = ocisti(telo.zprava, LIMITY.zprava);

  if (!jmeno || !email || !zprava) {
    res.status(400).json({ error: 'Vyplň prosím jméno, e-mail i zprávu.' });
    return;
  }
  if (!jeEmail(email)) {
    res.status(400).json({ error: 'Zkontroluj prosím tvar e-mailu.' });
    return;
  }

  const text = [
    `Jméno: ${jmeno}`,
    `E-mail: ${email}`,
    '',
    zprava,
    '',
    '—',
    'Odesláno z formuláře na www.nervyvkrajce.cz'
  ].join('\n');

  try {
    const odpoved = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${klic}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: ODESILATEL,
        to: [PRIJEMCE],
        // Odpovědět jde rovnou tazateli, ne odesílající službě
        reply_to: email,
        subject: `Téma do epizody od ${jmeno}`,
        text
      })
    });

    if (!odpoved.ok) {
      const detail = await odpoved.text();
      throw new Error(`Resend ${odpoved.status}: ${detail.slice(0, 300)}`);
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    // Detail necháváme v logu Vercelu, návštěvníkovi jen srozumitelnou hlášku
    console.error('kontakt:', err);
    res.status(502).json({ error: 'Odeslání se nepovedlo.' });
  }
}

/* MonkeeTools FAQ helper: a scripted on-site guide.
   No network calls, no tracking, no data leaves the browser.
   It answers FAQs from a fixed script and is clearly labeled as automated, not a live chat. */
(function () {
  if (window.__mtChat) return;
  window.__mtChat = true;

  var ACCENT = '#ba3f26';

  var css = [
    '#mt-chat-btn{position:fixed;right:18px;bottom:18px;z-index:9999;width:56px;height:56px;border-radius:50%;',
    'border:0;background:' + ACCENT + ';color:#fff;font-size:26px;cursor:pointer;box-shadow:0 4px 16px rgba(0,0,0,.25);',
    'display:flex;align-items:center;justify-content:center}',
    '#mt-chat-btn:hover{transform:scale(1.06)}',
    '#mt-chat-panel{position:fixed;right:18px;bottom:86px;z-index:9999;width:340px;max-width:calc(100vw - 36px);',
    'max-height:min(480px,calc(100vh - 120px));display:none;flex-direction:column;background:#fffdf9;',
    'border:1px solid #e8ded2;border-radius:16px;box-shadow:0 12px 40px rgba(0,0,0,.22);overflow:hidden;',
    'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}',
    '#mt-chat-panel.open{display:flex}',
    '#mt-chat-head{position:relative;background:' + ACCENT + ';color:#fff;padding:12px 50px 12px 14px}',
    '#mt-chat-close{position:absolute;right:4px;top:4px;width:40px;height:40px;border:0;border-radius:6px;background:transparent;color:#fff;font-size:22px;cursor:pointer}',
    '#mt-chat-head strong{display:block;font-size:14px}',
    '#mt-chat-head span{font-size:11.5px;opacity:.92}',
    '#mt-chat-log{flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:8px;min-height:120px}',
    '.mt-msg{max-width:85%;padding:9px 12px;border-radius:14px;font-size:13.5px;line-height:1.5;word-wrap:break-word}',
    '.mt-msg a{color:' + ACCENT + ';font-weight:700}',
    '.mt-bot{background:#f6efe6;color:#3a322a;border-bottom-left-radius:4px;align-self:flex-start}',
    '.mt-user{background:' + ACCENT + ';color:#fff;border-bottom-right-radius:4px;align-self:flex-end}',
    '.mt-typing{align-self:flex-start;background:#f6efe6;border-radius:14px;padding:10px 14px;font-size:13px;color:#8a7f72}',
    '#mt-chat-quick{display:flex;flex-wrap:wrap;gap:6px;padding:0 12px 8px}',
    '#mt-chat-quick button{border:1px solid ' + ACCENT + ';background:#fff;color:' + ACCENT + ';border-radius:20px;',
    'font-size:12px;font-weight:700;padding:6px 12px;cursor:pointer}',
    '#mt-chat-quick button:hover{background:' + ACCENT + ';color:#fff}',
    '#mt-chat-form{display:flex;border-top:1px solid #e8ded2}',
    '#mt-chat-input{flex:1;border:0;padding:12px;font-size:13.5px;background:transparent;outline:none;min-width:0}',
    '#mt-chat-form button{border:0;background:' + ACCENT + ';color:#fff;font-weight:800;padding:0 18px;cursor:pointer;font-size:13px}',
    '#mt-chat-peek{position:fixed;right:24px;bottom:24px;z-index:9998;width:44px;height:44px;pointer-events:none;opacity:0;',
    'transform:translateY(6px) scale(.7);transition:opacity .4s ease,transform .45s ease}',
    '#mt-chat-peek.show{opacity:1;transform:translateY(-30px) scale(1)}',
    '#mt-chat-peek svg{width:100%;height:100%;display:block}'
  ].join('\n');
  var st = document.createElement('style');
  st.textContent = css;
  document.head.appendChild(st);

  var btn = document.createElement('button');
  btn.id = 'mt-chat-btn';
  btn.type = 'button';
  btn.setAttribute('aria-label', 'Open the FAQ helper');
  btn.textContent = '💬';

  var panel = document.createElement('div');
  panel.id = 'mt-chat-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'FAQ helper');
  btn.setAttribute('aria-controls', 'mt-chat-panel');
  btn.setAttribute('aria-expanded', 'false');
  panel.innerHTML =
    '<div id="mt-chat-head"><strong>FAQ helper</strong>' +
    '<span>Scripted answers to common questions. Not a live chat.</span>' +
    '<button id="mt-chat-close" type="button" aria-label="Close the FAQ helper">✕</button></div>' +
    '<div id="mt-chat-log"></div>' +
    '<div id="mt-chat-quick"></div>' +
    '<form id="mt-chat-form"><input id="mt-chat-input" type="text" placeholder="Type a keyword, e.g. privacy…" ' +
    'aria-label="Search FAQs by keyword" autocomplete="off" maxlength="500" />' +
    '<button type="submit">Send</button></form>';

  document.body.appendChild(btn);
  document.body.appendChild(panel);

  // On the invoice homepage, keep the narrow-screen launcher in document flow.
  // It cannot obscure the concierge copy as the page scrolls; no data is stored.
  var concierge = document.getElementById('invoiceConcierge');
  if (concierge && window.matchMedia) {
    var helperHost = document.createElement('div');
    helperHost.id = 'mt-chat-inline-host';
    concierge.insertAdjacentElement('afterend', helperHost);
    var narrowLayout = window.matchMedia('(max-width:700px)');
    function placeHelper() {
      (narrowLayout.matches ? helperHost : document.body).appendChild(btn);
    }
    placeHelper();
    narrowLayout.addEventListener('change', placeHelper);
  }

  /* Rare monkey peek over the widget button. Decorative, never blocks the widget. */
  var peek = document.createElement('div');
  peek.id = 'mt-chat-peek';
  peek.setAttribute('aria-hidden', 'true');
  peek.innerHTML = '<svg viewBox="0 0 120 120"><circle cx="20" cy="46" r="17" fill="#ba3f26"/><circle cx="20" cy="46" r="8" fill="#f7e8d8"/><circle cx="100" cy="46" r="17" fill="#ba3f26"/><circle cx="100" cy="46" r="8" fill="#f7e8d8"/><circle cx="60" cy="64" r="42" fill="#e85d3f"/><path d="M52 24 q4 -8 8 0 q4 -8 8 0" stroke="#ba3f26" stroke-width="5" fill="none" stroke-linecap="round"/><ellipse cx="60" cy="74" rx="30" ry="25" fill="#f7e8d8"/><circle cx="48" cy="64" r="5.5" fill="#17232b"/><circle cx="72" cy="64" r="5.5" fill="#17232b"/><circle cx="50" cy="62" r="1.8" fill="#fff"/><circle cx="74" cy="62" r="1.8" fill="#fff"/><path d="M52 86 q8 -6 16 0" stroke="#17232b" stroke-width="3.5" fill="none" stroke-linecap="round"/></svg>';
  document.body.appendChild(peek);
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!reduceMotion) {
    setInterval(function () {
      if (panel.classList.contains('open') || peek.classList.contains('show')) return;
      if (Math.random() < 0.3) {
        peek.classList.add('show');
        setTimeout(function () { peek.classList.remove('show'); }, 2200);
      }
    }, 18000);
  }

  var log = panel.querySelector('#mt-chat-log');
  var quick = panel.querySelector('#mt-chat-quick');
  var form = panel.querySelector('#mt-chat-form');
  var input = panel.querySelector('#mt-chat-input');

  function scrollDown() { log.scrollTop = log.scrollHeight; }

  function addMsg(html, who) {
    var d = document.createElement('div');
    d.className = 'mt-msg ' + who;
    d.innerHTML = html;
    log.appendChild(d);
    scrollDown();
  }
  function addUser(text) {
    var d = document.createElement('div');
    d.className = 'mt-msg mt-user';
    d.textContent = text;
    log.appendChild(d);
    scrollDown();
  }

  var INTENTS = [
    { k: ['remind', 'overdue', 'late payment', 'chase', 'unpaid', 'nudge', 'final notice'],
      r: 'For an overdue invoice, open <strong>Invoice history</strong> and tap <strong>Remind</strong>: pick a polite, firm, or final tone, edit the draft, then send it from your own email app, text it to the client, or copy it. Nothing is sent automatically.' },
    { k: ['free', 'cost', 'price', 'pay', 'charge', 'subscription', 'trial'],
      r: 'Yep. <strong>free forever</strong> for the core tool: no account, no paywall on invoices, no trial that expires, no per-invoice charge, and no payment processing cut. If a client pays through your own Stripe link, Stripe\u2019s own fee applies, but we never take a cut. Optional paid branding features are available, including the $19 Brand Pack (removes the PDF footer and unlocks Email Finder, capped at 3 lookups a day per IP). See <a href="/unlock/">paid options and terms</a>.' },
    { k: ['invoice', 'pdf', 'create', 'make', 'generate', 'download', 'print'],
      r: 'Fill in your business and client details plus line items on the <a href="/">home page</a>, then download a clean PDF or print it. Takes about two minutes, nothing to install.' },
    { k: ['freelanc', 'self-employ', 'selfemploy', 'solo', 'contractor'],
      r: 'Built for you: no account, invoice editing and PDFs in your browser, and local remembering when you enable saving. Optional short links send the full invoice URL to our service; Finder lookups use our service. The full pitch: <a href="/freelancers/">/freelancers/</a>.' },
    { k: ['wave'],
      r: 'Quick honest take: <strong>Wave</strong> wins if you want free invoicing plus free accounting in one account, with built-in card processing. <strong>MonkeeTools</strong> wins if you want invoicing with no account at all: invoice editing and PDF generation run in your browser (optional service features like short links and the Finders send data to run, as the privacy page documents). Wave keeps your data on theirs and shares it across their corporate family for marketing (opt-out by email). Full comparison: <a href="/wave-alternative/">/wave-alternative/</a>.' },
    { k: ['zoho'],
      r: 'Quick honest take: <strong>Zoho Invoice</strong> is the most generous free invoicing product around and has a genuinely strong privacy policy, but it needs a Zoho account and stores your data on Zoho servers. <strong>MonkeeTools</strong> needs no account and invoice editing and PDF generation run in your browser. Optional short links and Finders use our service; see <a href="/privacy/">privacy details</a>. Full comparison: <a href="/zoho-alternative/">/zoho-alternative/</a>.' },
    { k: ['paypal'],
      r: 'Quick honest take: if your clients pay through <strong>PayPal</strong> and you are happy, stay. But PayPal takes 3.49% + 49&cent; every time a client pays a PayPal invoice, and your data lives on PayPal servers inside a PayPal account. <strong>MonkeeTools</strong> takes no cut, needs no account, and invoice editing and PDF generation run in your browser. Optional short links and Finders use our service; see <a href="/privacy/">privacy details</a>. If your clients pay by Zelle, check, cash, or your own link, you are paying PayPal for nothing. Full answer in the <a href="/freelancers/">freelancers FAQ</a>.' },
    { k: ['support', 'help desk', 'helpdesk', 'talk to a human', 'customer service', 'contact support'],
      r: 'Plain answer: no, and we would rather say so than bury it. MonkeeTools is built by an AI and one human, so there is no support team to call. If having a human on the phone matters to you, a bigger platform with real support staff might be a better fit. What you get instead: me (an automated FAQ helper), the <a href="/releases/">release notes</a> documenting every feature, and the public <a href="/feedback/">feedback board</a> reaching the people who build the tool.' },
    { k: ['switch', 'switching', 'migrate', 'migration', 'move from', 'import clients', 'leave wave', 'leave zoho', 'leave square', 'leave paypal'],
      r: 'That is what the switching tools are for: import your client list from a CSV file instead of retyping it, and if you change devices, a transfer code carries your business profile and client list to the new one with nothing uploaded. Export your invoice history as CSV any time, so nothing is ever locked in. Full answer in the <a href="/freelancers/">freelancers FAQ</a>.' },
    { k: ['text client', 'sms', 'send by text', 'send text', 'phone number'],
      r: 'After downloading, tap <strong>Text client</strong>: punch in the client\u2019s mobile number and your messaging app opens with the number and invoice text ready. One tap to send.' },
    { k: ['app store', 'appstore', 'iphone', 'ios app'],
      r: 'Not in the App Store yet: Apple charges $99/year for a developer account. There\u2019s an <strong>App Store fund</strong> donate button in the supporter section after download; when the community covers the fee, we ship the app. Meanwhile \u201cAdd to Home screen\u201d from your browser works like an app, free.' },
    { k: ['logo'],
      r: 'Upload your business logo in Settings (the gear icon). It shows on the invoice preview and prints on all three PDF designs. Logo branding is free, with no payment or license needed. Enable saving to remember it in this browser.' },
    { k: ['remember', 'settings', 'my data saved', 'keep my'],
      r: 'Tap <strong>Remember on this device</strong> to keep your business profile, clients, and invoice history in this browser. Each browser keeps its own copy, so stick to one browser (or use Add to Home screen) to keep everything. New here? The <strong>60-second setup tour</strong> on the home page walks you through Settings once.' },
    { k: ['plushie', 'plush', 'toy', 'merch'],
      r: 'There\u2019s a <strong>plushie fund</strong> in the supporter section after download: if enough donors chip in to cover the first manufacturing run, we\u2019ll have a real Monkee plushie made and ship one to every contributor. Put \u201cplushie\u201d in the notes field at checkout.' },
    { k: ['release', 'what\u2019s new', 'whats new', 'version'],
      r: 'Release notes live at <a href="/releases/">/releases/</a>, and the day-to-day changelog is in What\u2019s new on the <a href="/">home page</a>.' },
    { k: ['client', 'send', 'email', 'share'],
      r: 'Two ways: download the PDF and email it yourself, or share the <strong>/view/</strong> link if an AI agent made it for you: a clean client-ready page with no editing controls.' },
    { k: ['privac', 'data', 'track', 'store', 'safe', 'secur'],
      r: 'Invoice editing and PDF generation run in your browser; remembered records stay in this browser when saving is enabled. Sharing a client link discloses its invoice data to anyone with that link. Optional service features you choose (short links, the Finders, feedback) send data to run, and we count usage events as described in the privacy policy. Feedback is encrypted in your browser before it\u2019s sent. Full breakdown: <a href="/privacy/">/privacy/</a>.' },
    { k: ['feedback', 'suggest', 'idea', 'feature', 'request', 'bug', 'broken', 'wrong', 'issue'],
      r: 'Drop it on the <a href="/feedback/">feedback board</a>. Every entry is public, gets a reply, and your message is encrypted before it leaves your browser.' },
    { k: ['vote', 'tool', 'quote', 'recurring'],
      r: 'See <a href="/roadmap/">the roadmap</a> for what\u2019s planned. Hit \u201CI want this\u201D to vote. We build what people ask for.' },
    { k: ['agent', 'ai', 'Muse', 'chatgpt', 'Muse', 'llm'],
      r: 'Agents can hand clients a clean invoice link via <strong>/view/</strong>. The full handoff guide, with copy-paste prompts, is at <a href="/agents/">/agents/</a>.' },
    { k: ['who', 'about', 'made', 'monkee', 'brian', 'team', 'company', 'story'],
      r: 'MonkeeTools is Brian\u2019s bet: he challenged his AI assistant Monkee to build something worth paying for. Invoicing won. Full story: <a href="/about/">/about/</a>.' },
    { k: ['blog', 'news', 'update', 'changelog', 'roadmap'],
      r: 'Updates land in the changelog on the <a href="/">home page</a> and longer write-ups go to <a href="/blog/">/blog/</a>.' },
    { k: ['status', 'fixed', 'recently', 'update', 'fb-006', 'fb-007', 'audit'],
      r: 'Latest changes are in the changelog on the <a href="/">home page</a>. Every feedback entry and its status lives on the <a href="/feedback/">feedback board</a>, each one gets a public reply when it ships.' },
    { k: ['contact', 'human', 'person', 'real', 'support', 'help'],
      r: 'Email <a href="mailto:monkeetools@proton.me">monkeetools@proton.me</a>, or post on the <a href="/feedback/">feedback board</a>. Everything gets read.' },
    { k: ['affiliate', 'partner', 'referral', 'commission', 'sponsor'],
      r: 'We partner with tools we actually use (UptimeRobot keeps this site online). Affiliate links are marked and support the site at no cost to you: <a href="/partners/">/partners/</a>.' },
    { k: ['hi', 'hello', 'hey', 'yo', 'sup', 'morning', 'afternoon'],
      r: 'Hey! Ask me anything about MonkeeTools, or tap a topic below.' },
    { k: ['thank', 'great', 'cool', 'awesome', 'nice', 'love'],
      r: 'Anytime 🙂 If it saved you an afternoon, tell a freelancer friend.' },
    { k: ['bye', 'later', 'goodnight'],
      r: 'Later! 👋' }
  ];
  var FALLBACK = 'I don\u2019t know that one. I\u2019m just a scripted helper, not the real Monkee. ' +
    'Put it on the <a href="/feedback/">feedback board</a> and it\u2019ll get a proper answer.';

  function answerFor(text) {
    var t = ' ' + text.toLowerCase() + ' ';
    for (var i = 0; i < INTENTS.length; i++) {
      var ks = INTENTS[i].k;
      for (var j = 0; j < ks.length; j++) {
        if (t.indexOf(ks[j]) >= 0) return INTENTS[i].r;
      }
    }
    return FALLBACK;
  }

  function botSay(html) {
    var ty = document.createElement('div');
    ty.className = 'mt-typing';
    ty.textContent = '…';
    log.appendChild(ty);
    scrollDown();
    setTimeout(function () {
      ty.remove();
      addMsg(html, 'mt-bot');
    }, 350 + Math.random() * 350);
  }

  function handleUser(text) {
    var clean = text.trim();
    if (!clean) return;
    addUser(clean.length > 200 ? clean.slice(0, 200) + '…' : clean);
    botSay(answerFor(clean));
  }

  var QUICK = ['Is it really free?', 'How do invoices work?', 'Is my data private?', 'Give feedback'];
  function renderQuick() {
    quick.innerHTML = '';
    QUICK.forEach(function (q) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = q;
      b.addEventListener('click', function () { handleUser(q); });
      quick.appendChild(b);
    });
  }

  var opened = false;
  btn.addEventListener('click', function () {
    var isOpen = panel.classList.toggle('open');
    btn.textContent = isOpen ? '✕' : '💬';
    btn.setAttribute('aria-expanded', String(isOpen));
    if (isOpen && !opened) {
      opened = true;
      renderQuick();
      botSay('Hey! I\u2019m a scripted <strong>FAQ helper</strong>, not a live chat. ' +
        'Tap a topic below, or type a keyword like \u201cprivacy\u201d or \u201cinvoice\u201d.');
    }
    if (isOpen) input.focus();
  });
  panel.querySelector('#mt-chat-close').addEventListener('click', function () {
    if (panel.classList.contains('open')) btn.click();
    btn.focus();
  });
  panel.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') panel.querySelector('#mt-chat-close').click();
  });

  form.addEventListener('submit', function (ev) {
    ev.preventDefault();
    handleUser(input.value);
    input.value = '';
  });
})();

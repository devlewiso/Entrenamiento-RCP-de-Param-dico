// Pulso · simulador de ritmo y secuencia de RCP para adultos.
// Dos modos:
//  - guided:  una sola persona con maniquí o almohada. La app marca el ritmo con
//             sonido, cuenta las compresiones y avisa cuándo ventilar. Manos libres.
//  - partner: un compañero o instructor toca un botón por cada compresión y
//             ventilación que observa; así medimos ritmo real y pausas.
// Todo vive en memoria: nada se guarda al recargar (promesa de la demo Free).

const $ = id => document.getElementById(id);

const RATE_MIN = 100, RATE_MAX = 120;
const CYCLE_COMPRESSIONS = 30, CYCLE_BREATHS = 2;
const BREATH_GAP_MS = 2500;          // una ventilación ~1 s + exhalación
const BREATH_PHASE_MS = 5000;        // 2 ventilaciones; la pausa debe ser < 10 s
const CONTINUOUS_BREATH_MS = 6000;   // vía aérea avanzada: 1 ventilación cada 6 s
const SWITCH_EVERY_MS = 120000;      // cambio de reanimador / revisar ritmo cada 2 min
const SWITCH_PHASE_S = 10;
const MAX_PAUSE_MS = 10000;

const settings = { mode: 'guided', protocol: '30:2', rate: 110, sound: true, voice: true };

let state = 'initial';               // initial | countdown | playing | paused
let phase = 'compressions';          // compressions | breaths | switch
let compressions = 0, breaths = 0, phaseCount = 0, cycles = 0, switches = 0;
let elapsed = 0, startedAt = 0, sinceSwitch = 0, lastVentAt = 0;
let countdown = 3, switchLeft = SWITCH_PHASE_S;
let beatTimer, phaseTimers = [], ticker, countdownTimer, switchTimer, pulseOff;

// Métricas del modo con compañero.
let lastTap = 0, recent = [], inRange = 0, measured = 0, handsOffAt = 0, pauses = [];

const metronome = document.querySelector('.metronome');

/* ---------- Tiempo ---------- */
const activeMs = () => elapsed + (state === 'playing' ? performance.now() - startedAt : 0);
const beatMs = () => 60000 / settings.rate;
const fmt = ms => { const s = Math.floor(ms / 1000); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };

/* ---------- Sonido y voz ---------- */
let audio;
function initAudio() {
  if (!audio) { try { audio = new (window.AudioContext || window.webkitAudioContext)(); } catch { audio = null; } }
  if (audio && audio.state === 'suspended') audio.resume();
}
function tone(freq, dur, vol = 0.18, type = 'triangle') {
  if (!settings.sound || !audio) return;
  const o = audio.createOscillator(), g = audio.createGain(), t = audio.currentTime;
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(audio.destination); o.start(t); o.stop(t + dur + 0.05);
}
const click = accent => tone(accent ? 1480 : 980, 0.06, accent ? 0.28 : 0.2);
const breathTone = () => tone(520, 0.9, 0.16, 'sine');
function say(text) {
  if (!settings.voice || !('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'es-ES'; u.rate = 1.1;
  const v = speechSynthesis.getVoices().find(v => v.lang.startsWith('es'));
  if (v) u.voice = v;
  speechSynthesis.speak(u);
}

/* ---------- Pantalla encendida ---------- */
let wakeLock = null;
async function keepAwake(on) {
  try {
    if (on && 'wakeLock' in navigator && !wakeLock) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } else if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; }
  } catch { /* el navegador puede negarlo; la práctica sigue igual */ }
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && state === 'playing') keepAwake(true); });

/* ---------- Reloj de compresiones ---------- */
function flash() {
  metronome.classList.add('active'); clearTimeout(pulseOff);
  pulseOff = setTimeout(() => metronome.classList.remove('active'), 150);
}
function startBeats() {
  clearTimeout(beatTimer);
  let next = performance.now();
  const step = () => {
    if (state !== 'playing' || phase !== 'compressions') return;
    beat();
    next += beatMs();
    beatTimer = setTimeout(step, Math.max(0, next - performance.now()));
  };
  step();
}
function beat() {
  flash();
  if (settings.mode === 'guided') {
    compressions++; phaseCount++;
    const cycleEnd = settings.protocol === '30:2' && phaseCount === CYCLE_COMPRESSIONS;
    click(cycleEnd || phaseCount % 10 === 0);
    if (settings.protocol === '30:2' && phaseCount === CYCLE_COMPRESSIONS - 3) say('Prepárate');
    if (cycleEnd) { clearTimeout(beatTimer); phaseTimers.push(setTimeout(startBreaths, beatMs())); }
  } else if (settings.sound) {
    click(false); // guía sonora para quien comprime; el conteo lo hace el compañero
  }
  if (settings.protocol === 'continuous' && activeMs() - lastVentAt >= CONTINUOUS_BREATH_MS) {
    lastVentAt = activeMs();
    breathTone();
    if (settings.mode === 'guided') { breaths++; feedback('Ventila ahora sin detener las compresiones (1 cada 6 s).'); }
    else feedback('Momento de ventilar: registra la ventilación cuando ocurra.');
  }
  if (settings.protocol === 'continuous' && activeMs() - sinceSwitch >= SWITCH_EVERY_MS) startSwitch();
  render();
}

/* ---------- Fases ---------- */
function startBreaths() {
  phase = 'breaths'; phaseCount = 0;
  if (settings.mode === 'guided') {
    say('Ventila');
    feedback('Dos ventilaciones: sigue los tonos. La pausa debe durar menos de 10 segundos.');
    const give = () => { breaths++; phaseCount++; breathTone(); render(); };
    phaseTimers.push(setTimeout(give, 0), setTimeout(give, BREATH_GAP_MS), setTimeout(endBreaths, BREATH_PHASE_MS));
  } else {
    handsOffAt = lastTap;
    feedback('30 compresiones. Registra las 2 ventilaciones y reanuda enseguida.');
  }
  render();
}
function endBreaths() {
  cycles++; phaseCount = 0;
  if (activeMs() - sinceSwitch >= SWITCH_EVERY_MS) { startSwitch(); return; }
  resumeCompressions('Compresiones');
}
function resumeCompressions(voice, keepCount = false) {
  phase = 'compressions'; if (!keepCount) phaseCount = 0; lastTap = 0; recent = [];
  if (voice) say(voice);
  feedback(settings.mode === 'guided' ? 'Comprime al ritmo del sonido. La app cuenta por ti.' : 'Registra cada compresión que observes.');
  render();
  if (settings.mode === 'guided' || settings.sound) startBeats();
}
function startSwitch() {
  clearTimeout(beatTimer); clearPhaseTimers();
  phase = 'switch'; switchLeft = SWITCH_PHASE_S;
  if (settings.mode === 'partner') handsOffAt = lastTap || performance.now();
  say('Cambio de reanimador. Verifica el ritmo.');
  tone(660, 0.25); setTimeout(() => tone(880, 0.35), 280);
  feedback('2 minutos: cambien de reanimador y verifiquen el ritmo en menos de 10 segundos.');
  render();
  clearInterval(switchTimer);
  switchTimer = setInterval(() => {
    switchLeft--;
    if (switchLeft <= 0) {
      clearInterval(switchTimer); switches++; sinceSwitch = activeMs(); lastVentAt = activeMs();
      resumeCompressions('Comprime');
    } else render();
  }, 1000);
}
function clearPhaseTimers() { phaseTimers.forEach(clearTimeout); phaseTimers = []; }
function stopClocks() {
  clearTimeout(beatTimer); clearPhaseTimers(); clearInterval(ticker); clearInterval(countdownTimer);
  clearInterval(switchTimer); clearTimeout(pulseOff); metronome.classList.remove('active');
}

/* ---------- Registro manual (modo con compañero) ---------- */
function registerCompression() {
  const now = performance.now();
  if (handsOffAt) {
    const pause = now - handsOffAt; pauses.push(pause); handsOffAt = 0;
    if (pause > MAX_PAUSE_MS) feedback(`Pausa de ${(pause / 1000).toFixed(1)} s: intenta volver a comprimir en menos de 10 s.`);
  }
  if (lastTap) {
    const gap = now - lastTap;
    if (gap < 250) return; // doble toque accidental (>240 comp/min no es real)
    if (gap < 2000) {      // pausas largas no cuentan como ritmo
      const rpm = 60000 / gap; measured++; if (rpm >= RATE_MIN && rpm <= RATE_MAX) inRange++;
      recent.push(gap); if (recent.length > 5) recent.shift();
    }
  }
  lastTap = now; compressions++; phaseCount++;
  if (settings.protocol === '30:2' && phaseCount === CYCLE_COMPRESSIONS) { clearTimeout(beatTimer); startBreaths(); return; }
  if (recent.length >= 2) {
    const rpm = currentRpm();
    feedback(rpm < RATE_MIN ? 'Más rápido: el objetivo es 100–120 por minuto.' : rpm > RATE_MAX ? 'Más despacio: el objetivo es 100–120 por minuto.' : 'Buen ritmo, sigue así.');
  }
  if (settings.protocol === 'continuous' && activeMs() - sinceSwitch >= SWITCH_EVERY_MS) { startSwitch(); return; }
  render();
}
function registerBreath() {
  breaths++;
  if (settings.protocol === '30:2') {
    phaseCount++;
    if (phaseCount === CYCLE_BREATHS) { endBreaths(); return; }
  } else {
    lastVentAt = activeMs();
  }
  render();
}
function action() {
  if (state !== 'playing' || settings.mode !== 'partner') return;
  if (phase === 'compressions') registerCompression();
  else if (phase === 'breaths') registerBreath();
}
const currentRpm = () => recent.length ? Math.round(60000 / (recent.reduce((a, b) => a + b, 0) / recent.length)) : null;

/* ---------- Controles ---------- */
function play() {
  stopClocks(); state = 'playing'; startedAt = performance.now();
  keepAwake(true);
  ticker = setInterval(render, 250);
  if (phase === 'breaths' && settings.mode === 'guided') { breaths -= phaseCount; startBreaths(); }
  else if (phase === 'switch') startSwitch();
  else if (phase === 'breaths') { feedback('Registra las ventilaciones para completar el ciclo.'); render(); }
  else resumeCompressions(settings.mode === 'guided' ? 'Comprime' : null, true);
  $('summary').hidden = true;
  if (settings.mode === 'partner') $('actionBtn').focus({ preventScroll: true });
}
function pause() {
  if (state === 'playing') elapsed += performance.now() - startedAt;
  stopClocks(); state = 'paused'; lastTap = 0; recent = [];
  keepAwake(false); window.speechSynthesis?.cancel();
  feedback('Sesión en pausa. Tu resumen está abajo.');
  renderSummary(); render();
}
function reset() {
  stopClocks(); keepAwake(false); window.speechSynthesis?.cancel();
  state = 'initial'; phase = 'compressions';
  compressions = breaths = phaseCount = cycles = switches = 0;
  elapsed = sinceSwitch = lastVentAt = 0; lastTap = 0; recent = []; inRange = measured = 0; handsOffAt = 0; pauses = [];
  $('summary').hidden = true;
  feedback(introText()); render();
}
$('startBtn').addEventListener('click', () => {
  initAudio();
  if (state === 'playing' || state === 'countdown') { pause(); return; }
  if (state === 'paused') { play(); return; }
  state = 'countdown'; countdown = 3; sinceSwitch = 0; lastVentAt = 0;
  say('Colócate en posición');
  feedback('Colócate: manos entrelazadas en el centro del pecho, brazos rectos.');
  render();
  countdownTimer = setInterval(() => { countdown--; if (countdown === 0) { clearInterval(countdownTimer); play(); } else render(); }, 1000);
});
$('resetBtn').addEventListener('click', reset);
$('actionBtn').addEventListener('click', action);
$('ventBtn').addEventListener('click', () => { if (state === 'playing' && settings.mode === 'partner' && phase === 'compressions') registerBreath(); });

document.addEventListener('keydown', e => {
  if (e.repeat || /^(BUTTON|A|INPUT|TEXTAREA|SELECT|SUMMARY)$/.test(e.target.tagName) || e.target.isContentEditable) return;
  if (e.code === 'Space') {
    e.preventDefault();
    if (settings.mode === 'partner' && state === 'playing') action(); else $('startBtn').click();
  }
  if (e.code === 'KeyV' && settings.mode === 'partner' && settings.protocol === 'continuous') $('ventBtn').click();
});

document.querySelectorAll('input[name="mode"]').forEach(r => r.addEventListener('change', () => { settings.mode = r.value; reset(); }));
$('protocol').addEventListener('change', e => { settings.protocol = e.target.value; reset(); });
$('rate').addEventListener('change', e => { settings.rate = Number(e.target.value); render(); });
$('soundToggle').addEventListener('change', e => {
  settings.sound = e.target.checked; initAudio();
  if (state === 'playing' && phase === 'compressions' && settings.mode === 'partner') { if (settings.sound) startBeats(); else clearTimeout(beatTimer); }
});
$('voiceToggle').addEventListener('change', e => { settings.voice = e.target.checked; if (!settings.voice) window.speechSynthesis?.cancel(); });

/* ---------- Render ---------- */
function feedback(text) { $('feedback').textContent = text; }
function introText() {
  return settings.mode === 'guided'
    ? 'Modo guiado: coloca el celular a la vista, sube el volumen y comprime al ritmo del sonido. No necesitas tocar la pantalla.'
    : 'Modo con compañero: quien comprime sigue el sonido; tu compañero toca el botón en cada compresión que observa.';
}
function render() {
  const guided = settings.mode === 'guided', cont = settings.protocol === 'continuous';
  const initial = state === 'initial', counting = state === 'countdown', playing = state === 'playing';
  const breathing = phase === 'breaths', switching = phase === 'switch';

  $('timerStat').textContent = fmt(activeMs());
  $('compressionStat').textContent = compressions;
  $('breathStat').textContent = breaths;
  const rpm = guided ? settings.rate : currentRpm();
  $('rpmStat').textContent = rpm ?? '—';
  $('rpmNote').textContent = guided ? 'Ritmo que marca la guía' : 'Medido con los toques · meta 100–120';
  $('compressionNote').textContent = guided ? 'Contadas por el metrónomo' : 'Registradas por tu compañero';
  $('cycleStat').textContent = cont
    ? `${switches} ${switches === 1 ? 'cambio' : 'cambios'} de reanimador`
    : `${cycles} ${cycles === 1 ? 'ciclo' : 'ciclos'} · ${switches} ${switches === 1 ? 'cambio' : 'cambios'}`;

  $('state').textContent = { initial: 'Listo para comenzar', countdown: 'Preparando sesión', playing: 'Práctica en curso', paused: 'Sesión en pausa' }[state];
  $('state').classList.toggle('playing', playing);

  const toSwitch = Math.max(0, SWITCH_EVERY_MS - (activeMs() - sinceSwitch));
  $('phase-label').textContent = initial ? 'PREPARA TU SESIÓN' : counting ? 'ENCUENTRA TU POSICIÓN' : switching ? 'CAMBIO DE REANIMADOR' : breathing ? 'FASE DE VENTILACIONES' : 'FASE DE COMPRESIONES';
  $('phase-count').textContent = counting ? countdown : switching ? switchLeft : initial ? (cont ? '∞' : CYCLE_COMPRESSIONS) : (cont ? compressions : phaseCount);
  $('phase-total').textContent = counting ? 'segundos para comenzar'
    : switching ? 'segundos para reanudar'
    : initial ? (cont ? 'compresiones continuas' : 'compresiones por ciclo')
    : cont ? `compresiones · cambio en ${fmt(toSwitch)}`
    : breathing ? `de ${CYCLE_BREATHS} ventilaciones` : `de ${CYCLE_COMPRESSIONS} compresiones`;
  $('gameArea').textContent = initial ? (guided ? 'La app contará por ti' : 'Tu compañero registra cada compresión')
    : counting ? 'La práctica comienza en breve'
    : state === 'paused' ? 'Continúa cuando estés listo'
    : switching ? 'Cambien de lugar y verifiquen el ritmo'
    : breathing ? (guided ? 'Ventila con cada tono' : 'Registra cada ventilación')
    : cont ? '1 ventilación cada 6 s sin detenerte' : `Cambio de reanimador en ${fmt(toSwitch)}`;

  const total = switching ? SWITCH_PHASE_S : breathing ? CYCLE_BREATHS : CYCLE_COMPRESSIONS;
  const done = switching ? SWITCH_PHASE_S - switchLeft : cont && !breathing ? (SWITCH_EVERY_MS - toSwitch) / SWITCH_EVERY_MS * total : phaseCount;
  $('progress').style.width = `${initial || counting ? 0 : Math.min(100, done / total * 100)}%`;
  const track = document.querySelector('.progress-track');
  track.setAttribute('aria-valuemax', total); track.setAttribute('aria-valuenow', Math.round(done));

  const action = $('actionBtn');
  action.hidden = guided;
  action.disabled = !playing || switching;
  action.innerHTML = breathing ? 'Registrar ventilación <span>≈</span>' : 'Registrar compresión <span>↓</span>';
  $('ventBtn').hidden = guided || !cont;
  $('ventBtn').disabled = !playing || switching;
  $('keyHint').innerHTML = guided
    ? '<kbd>Espacio</kbd> inicia o pausa · manos libres'
    : cont ? 'Compañero: <kbd>Espacio</kbd> compresión · <kbd>V</kbd> ventilación' : 'Compañero: haz clic o pulsa <kbd>Espacio</kbd>';

  $('rateLabel').textContent = `${settings.rate} comp/min`;
  $('metronomeNote').textContent = settings.sound ? 'Sonido y pulso visual' : 'Solo pulso visual';
  $('scenarioText').textContent = `Escenario de adulto · ${cont ? 'Con vía aérea avanzada' : 'Sin vía aérea avanzada'} · ${guided ? 'Práctica individual' : 'Con compañero'}`;
  $('protocolRatio').innerHTML = cont ? 'Continuas' : '30 <span>:</span> 2';
  $('protocolNote').innerHTML = cont ? 'Compresiones <span>1 ventilación / 6 s</span>' : 'Compresiones <span>Ventilaciones</span>';

  const locked = !initial;
  document.querySelectorAll('input[name="mode"], #protocol').forEach(el => { el.disabled = locked; });
  $('setupNote').hidden = !locked;
  $('startBtn').innerHTML = state === 'initial' ? '▶ <span>Iniciar práctica</span>' : state === 'paused' ? '▶ <span>Continuar</span>' : 'Ⅱ <span>Pausar</span>';
}

function renderSummary() {
  const guided = settings.mode === 'guided';
  const rows = [
    ['Tiempo activo', fmt(elapsed)],
    ['Compresiones', compressions],
    ['Ventilaciones', breaths],
  ];
  if (settings.protocol === '30:2') rows.push(['Ciclos 30:2', cycles]);
  rows.push(['Cambios de reanimador', switches]);
  if (guided) {
    rows.push(['Ritmo de la guía', `${settings.rate} comp/min`]);
  } else {
    rows.push(['Ritmo en rango (100–120)', measured ? `${Math.round(inRange / measured * 100)}%` : '—']);
    const longest = pauses.length ? Math.max(...pauses) : 0;
    rows.push(['Pausa más larga', pauses.length ? `${(longest / 1000).toFixed(1)} s` : '—']);
    rows.push(['Pausas de más de 10 s', pauses.filter(p => p > MAX_PAUSE_MS).length]);
  }
  $('summary').innerHTML = `<p class="eyebrow">RESUMEN DE LA SESIÓN</p><dl>${rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>`
    + `<p class="summary-note">${guided ? 'En modo guiado la app no puede medir tu ritmo real: para eso usa el modo con compañero.' : 'Mide el ritmo y las pausas, no la profundidad ni el retroceso del tórax.'} Estos datos se borran al reiniciar o recargar.</p>`;
  $('summary').hidden = false;
}

feedback(introText());
render();

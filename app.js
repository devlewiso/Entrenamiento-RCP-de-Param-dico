const $ = id => document.getElementById(id);
let state = 'initial', phase = 'compressions', compressions = 0, breaths = 0, phaseCount = 0, cycles = 0;
let elapsed = 0, startedAt = 0, lastTap = 0, intervals = [], countdown = 3, countdownTimer, ticker, pulseTimer, pulseOff;
const metronome = document.querySelector('.metronome');
function render() {
  const seconds = Math.floor((elapsed + (state === 'playing' ? performance.now() - startedAt : 0)) / 1000);
  $('timerStat').textContent = `${String(Math.floor(seconds / 60)).padStart(2,'0')}:${String(seconds % 60).padStart(2,'0')}`;
  $('compressionStat').textContent = compressions;
  $('breathStat').textContent = breaths;
  const rpm = intervals.length ? Math.round(60000 / (intervals.reduce((a,b)=>a+b,0) / intervals.length)) : null;
  $('rpmStat').textContent = rpm ?? '—';
  $('cycleStat').textContent = `${cycles} ${cycles === 1 ? 'ciclo completado' : 'ciclos completados'}`;
  const initial = state === 'initial', counting = state === 'countdown', breathing = phase === 'breaths';
  $('state').textContent = {initial:'Listo para comenzar',countdown:'Preparando sesión',playing:'Práctica en curso',paused:'Sesión en pausa'}[state];
  $('state').classList.toggle('playing',state==='playing');
  $('phase-label').textContent = initial ? 'PREPARA TU SESIÓN' : counting ? 'ENCUENTRA TU POSICIÓN' : breathing ? 'FASE DE VENTILACIONES' : 'FASE DE COMPRESIONES';
  $('phase-count').textContent = counting ? countdown : initial ? 30 : phaseCount;
  $('phase-total').textContent = counting ? 'segundos para comenzar' : initial ? 'compresiones por ciclo' : `de ${breathing ? 2 : 30} ${breathing ? 'ventilaciones' : 'compresiones'}`;
  $('gameArea').textContent = initial ? 'Todo listo para practicar' : counting ? 'La práctica comienza en breve' : state === 'paused' ? 'Continúa cuando estés listo' : breathing ? 'Registra cada ventilación simulada' : 'Pulsa una vez por compresión';
  $('actionBtn').disabled = state !== 'playing';
  $('actionBtn').textContent = breathing ? 'Registrar ventilación ≈' : 'Registrar compresión ↓';
  $('progress').style.width = `${initial || counting ? 0 : phaseCount / (breathing ? 2 : 30) * 100}%`;
  const track=document.querySelector('.progress-track');track.setAttribute('aria-valuemax',breathing?2:30);track.setAttribute('aria-valuenow',phaseCount);
  $('startBtn').textContent = state === 'initial' ? '▶ Iniciar práctica' : state === 'paused' ? '▶ Continuar' : 'Ⅱ Pausar';
}
function stopClocks() {
  clearInterval(ticker);clearInterval(pulseTimer);clearInterval(countdownTimer);clearTimeout(pulseOff);metronome.classList.remove('active');
}
function pulse() {
  if (state !== 'playing' || phase !== 'compressions') return;
  metronome.classList.add('active');clearTimeout(pulseOff);pulseOff=setTimeout(()=>metronome.classList.remove('active'),150);
}
function play() {
  stopClocks();state='playing';startedAt=performance.now();lastTap=0;
  ticker=setInterval(render,200);pulseTimer=setInterval(pulse,60000/110);pulse();
  $('feedback').textContent=phase==='breaths'?'Registra las ventilaciones para completar el ciclo.':'Sigue el pulso visual y registra cada compresión.';render();$('actionBtn').focus({preventScroll:true});
}
$('startBtn').addEventListener('click',()=>{
  if(state==='playing'||state==='countdown'){
    if(state==='playing')elapsed+=performance.now()-startedAt;
    stopClocks();state='paused';lastTap=0;intervals=[];$('feedback').textContent='Sesión en pausa. Conservamos tu progreso.';render();return;
  }
  if(state==='paused'){play();return;}
  state='countdown';countdown=3;$('feedback').textContent='Prepárate: comenzamos en 3 segundos.';render();
  countdownTimer=setInterval(()=>{countdown--;if(countdown===0)play();else render();},1000);
});
function action() {
  if(state!=='playing')return;
  if(phase==='compressions'){
    const now=performance.now();if(lastTap){const gap=now-lastTap;if(gap<100)return;intervals.push(gap);if(intervals.length>5)intervals.shift();}lastTap=now;
    compressions++;phaseCount++;
    if(phaseCount===30){phase='breaths';phaseCount=0;lastTap=0;intervals=[];metronome.classList.remove('active');$('feedback').textContent='30 compresiones registradas. Ahora, 2 ventilaciones simuladas.';}
    else if(intervals.length){const rpm=60000/(intervals.reduce((a,b)=>a+b,0)/intervals.length);$('feedback').textContent=rpm<100?'Aumenta un poco el ritmo. Sigue el indicador visual.':rpm>120?'Reduce un poco el ritmo. Sigue el indicador visual.':'Buen ritmo: estás entre 100 y 120 pulsaciones por minuto.';}
  }else{
    breaths++;phaseCount++;
    if(phaseCount===2){cycles++;phase='compressions';phaseCount=0;lastTap=0;intervals=[];$('feedback').textContent='Ciclo completado. Comienza las siguientes 30 compresiones.';}
  }render();
}
$('actionBtn').addEventListener('click',action);
document.addEventListener('keydown',event=>{
  if(event.code!=='Space'||event.repeat||/^(BUTTON|A|INPUT|TEXTAREA|SELECT|SUMMARY)$/.test(event.target.tagName)||event.target.isContentEditable)return;
  if(state==='playing'){event.preventDefault();action();}
});
$('resetBtn').addEventListener('click',()=>{
  stopClocks();state='initial';phase='compressions';compressions=0;breaths=0;phaseCount=0;cycles=0;elapsed=0;lastTap=0;intervals=[];
  $('feedback').textContent='Inicia cuando estés listo. Tú marcas cada compresión.';render();
});
render();

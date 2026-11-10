const keys = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const timeMinutes = time => {
  if (!/^\d{2}:\d{2}$/.test(time ?? '')) return null;
  const [hour, minute] = time.split(':').map(Number);
  return hour <= 23 && minute <= 59 ? hour * 60 + minute : null;
};
const fallback = { text: 'Уточните часы по телефону', kind: 'unknown' };

function openingStatus(fact, now = new Date()) {
  if (fact?.status !== 'confirmed' || !fact.value?.days) return fallback;
  const schedule = fact.value;
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Samara', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(now).map(part => [part.type, part.value]));
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  const previousDate = new Date(`${date}T12:00:00Z`);
  previousDate.setUTCDate(previousDate.getUTCDate() - 1);
  const previousISO = previousDate.toISOString().slice(0, 10);
  const todayException = schedule.exceptions?.find(item => item.date === date);
  const previousException = schedule.exceptions?.find(item => item.date === previousISO);
  // Weekly hours alone do not verify holidays, transferred days or special closures.
  // Dynamic status is allowed only within a source-verified coverage period.
  const coverage = schedule.exception_coverage;
  if (schedule.exceptions_verified !== true || !coverage?.from || !coverage?.through ||
      date > coverage.through || previousISO < coverage.from) return fallback;
  const current = todayException?.intervals ?? schedule.days[keys[day]];
  const previous = previousException?.intervals ?? schedule.days[keys[(day + 6) % 7]];
  if (!Array.isArray(current) || !Array.isArray(previous)) return fallback;
  const minute = Number(parts.hour) * 60 + Number(parts.minute);
  for (const interval of previous) {
    const start = timeMinutes(interval.open), end = timeMinutes(interval.close);
    if (start === null || end === null || start === end) return fallback;
    if (end < start && minute < end) return { text: `Открыто до ${interval.close}`, kind: 'open' };
  }
  for (const interval of current) {
    const start = timeMinutes(interval.open), end = timeMinutes(interval.close);
    if (start === null || end === null || start === end) return fallback;
    if (minute >= start && (end < start || minute < end)) return { text: `Открыто до ${interval.close}${end < start ? ' завтра' : ''}`, kind: 'open' };
  }
  const later = current.filter(interval => timeMinutes(interval.open) > minute).sort((a,b) => timeMinutes(a.open) - timeMinutes(b.open));
  return { text: later.length ? `Закрыто · сегодня с ${later[0].open}` : 'Сейчас закрыто', kind: 'closed' };
}

const data = JSON.parse(document.querySelector('#hours-data').textContent);
function refresh() {
  const status = openingStatus(data);
  document.querySelectorAll('[data-hours-status]').forEach(element => {
    element.textContent = status.text;
    element.dataset.state = status.kind;
  });
}
refresh();
setInterval(refresh, 30_000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });

const search = document.querySelector('#service-search');
const groups = [...document.querySelectorAll('.service-group')];
const initialOpen = groups.map(group => group.open);
function filterServices() {
  const query = search.value.trim().toLocaleLowerCase('ru');
  let visible = 0;
  groups.forEach((group,index) => {
    const rows = [...group.querySelectorAll('[data-service]')];
    rows.forEach(row => { row.hidden = !row.dataset.search.includes(query); if (!row.hidden) visible++; });
    group.hidden = rows.every(row => row.hidden);
    group.open = query ? !group.hidden : initialOpen[index];
  });
  document.querySelector('#search-empty').hidden = visible > 0;
  document.querySelector('#search-count').textContent = query ? `Найдено: ${visible}` : `Услуг в каталоге: ${visible}`;
}
search?.addEventListener('input',filterServices);
document.querySelectorAll('[data-category-link]').forEach(link => link.addEventListener('click',()=>{
  if (search.value) { search.value=''; filterServices(); }
  const target=document.getElementById(link.dataset.categoryLink);
  if (target) target.open=true;
}));

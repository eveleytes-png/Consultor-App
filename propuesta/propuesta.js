const toast = document.querySelector('.toast');
let toastTimer;
function notify(message){
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
}
document.addEventListener('click', (event) => {
  const action = event.target.closest('[data-action]');
  if (action) notify(`${action.dataset.action}: flujo listo para conectar con la funcionalidad existente.`);
});
const sections = [...document.querySelectorAll('main section[id]')];
const navLinks = [...document.querySelectorAll('.nav-link, .mobile-nav a')];
const observer = new IntersectionObserver((entries) => {
  const visible = entries.filter((entry) => entry.isIntersecting).sort((a,b) => b.intersectionRatio - a.intersectionRatio)[0];
  if (!visible) return;
  navLinks.forEach((link) => link.classList.toggle('active', link.getAttribute('href') === `#${visible.target.id}` || (visible.target.id === 'cartera' && link.getAttribute('href') === '#inicio')));
}, {rootMargin:'-25% 0px -60% 0px', threshold:[0,.2,.5]});
sections.forEach((section) => observer.observe(section));

// nav.js — puts the nav and footer into every page
function load(file, target) {
  fetch(file)
    .then(r => r.text())
    .then(html => {
      document.getElementById(target).innerHTML = html;
    });
}

load('nav.html', 'site-header');
load('footer.html', 'site-footer');

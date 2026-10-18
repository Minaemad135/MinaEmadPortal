const siteNav = document.getElementById("siteNav");
const menuToggle = document.getElementById("menuToggle");
const yearEl = document.getElementById("year");

if (yearEl) yearEl.textContent = new Date().getFullYear();

menuToggle.addEventListener("click", () => {
  siteNav.classList.toggle("open");
});

siteNav.querySelectorAll("a").forEach((link) => {
  link.addEventListener("click", () => siteNav.classList.remove("open"));
});

const sections = document.querySelectorAll("section");

if ("IntersectionObserver" in window) {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15 }
  );

  sections.forEach((section) => observer.observe(section));
} else {
  sections.forEach((section) => section.classList.add("visible"));
}

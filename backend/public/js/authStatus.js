// ✅ js/authStatus.js
document.addEventListener("DOMContentLoaded", () => {
  const navProfileLink = document.getElementById("navProfileLink");

  // Check login status from localStorage or sessionStorage
  const currentUser = JSON.parse(localStorage.getItem("currentUser"));

  if (currentUser && navProfileLink) {
    navProfileLink.style.display = "block";

    // Optional: dynamically show initials or logo
    const initialsSpan = document.getElementById("profileIconInitials");
    if (initialsSpan && currentUser.fullName) {
      initialsSpan.textContent = currentUser.fullName
        .split(" ")
        .map(n => n[0])
        .join("")
        .toUpperCase();
    }
  }
});

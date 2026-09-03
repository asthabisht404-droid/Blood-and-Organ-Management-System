// main.js - frontend client script

document.addEventListener('DOMContentLoaded', () => {
  attachAuthHandlers();
  attachRequestHandlers();
  attachOrganHandlers();
  attachNavState();

  // If on index/donor-list pages, fetch donors
  if (location.pathname.endsWith('index.html') || location.pathname.endsWith('/') || location.pathname.endsWith('donor-list.html')) {
    loadAvailableDonors();
    fetchAndRenderDonors();
    fetchAndRenderRequests();
    fetchInventoryStats();
  }

  if (location.pathname.endsWith('organ-list.html')) {
    fetchAndRenderOrganAvailability();
  }

  if (location.pathname.endsWith('donor-profile.html')) {
    loadUserProfile();
  }
});

/* --------------------
   Utilities
   -------------------- */
function qs(sel) { return document.querySelector(sel); }
function qsa(sel) { return Array.from(document.querySelectorAll(sel)); }

function showMessage(el, text, isError) {
  if (!el) return;
  el.textContent = text;
  el.style.color = isError ? 'crimson' : 'green';
  setTimeout(() => { el.textContent = ''; }, 3500);
}

/* --------------------
   Auth: register & login
   -------------------- */
function attachAuthHandlers() {
  const registerForm = qs('#registerForm');
  if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(registerForm).entries());
      // convert checkbox (isOrganDonor) to 1/0
      data.isOrganDonor = registerForm.querySelector('#isOrganDonor')?.checked ? 1 : 0;
      // normalize key: use username as email
      data.username = data.username || data.email;
      try {
        const res = await fetch('/register', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify(data)
        });
        const json = await res.json();
        if (res.ok) {
          // store basic state
          localStorage.setItem('isLoggedIn', 'true');
          localStorage.setItem('email', data.username);
          // store minimal profile data (from form)
          localStorage.setItem('fullName', data.fullName || '');
          localStorage.setItem('phone', data.phone || '');
          localStorage.setItem('bloodType', data.bloodType || '');
          showMessage(qs('#registerMessage'), json.message || 'Registered', false);
          setTimeout(() => location.href = 'donor-profile.html', 900);
        } else {
          showMessage(qs('#registerMessage'), json.message || 'Registration failed', true);
        }
      } catch (err) {
        console.error('Registration network error', err);
        showMessage(qs('#registerMessage'), 'Network error registering', true);
      }
    });
  }

  const loginForm = qs('#loginForm');
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(loginForm).entries());
      // backend expects username key (we accept username or email)
      data.username = data.username || data.email;
      try {
        const res = await fetch('/login', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify(data)
        });
        const json = await res.json();
        if (res.ok) {
          // save all returned profile fields to localStorage
          localStorage.setItem('isLoggedIn', 'true');
          localStorage.setItem('email', json.user.email || data.username);
          // save profile data
          for (const k in json.user) {
            if (json.user[k] !== undefined && json.user[k] !== null) {
              localStorage.setItem(k, String(json.user[k]));
            }
          }
          showMessage(qs('#loginMessage'), json.message || 'Logged in', false);
          setTimeout(() => location.href = 'donor-profile.html', 700);
        } else {
          showMessage(qs('#loginMessage'), json.message || 'Login failed', true);
        }
      } catch (err) {
        console.error('Login network error', err);
        showMessage(qs('#loginMessage'), 'Network error logging in', true);
      }
    });
  }
}

/* --------------------
   Navigation UI updates
   -------------------- */
function attachNavState() {
  updateNavAuthStatus();
  qsa('#navAuthButton a, #navProfileLink a').forEach(el => {
    // no-op
  });
}

function updateNavAuthStatus() {
  const navProfileLink = qs('#navProfileLink');
  const navAuthButton = qs('#navAuthButton');
  const initialsSpan = qs('#profileIconInitials');
  const isLoggedIn = localStorage.getItem('isLoggedIn') === 'true';
  const email = localStorage.getItem('email') || '';
  const fullName = localStorage.getItem('fullName') || '';
  if (isLoggedIn && email) {
    if (navProfileLink) navProfileLink.style.display = 'flex';
    if (navAuthButton) navAuthButton.style.display = 'none';
    if (initialsSpan) initialsSpan.textContent = getInitials(fullName);
  } else {
    if (navProfileLink) navProfileLink.style.display = 'none';
    if (navAuthButton) navAuthButton.style.display = 'block';
  }
}

function getInitials(fullName) {
  if (!fullName) return 'AS';
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/* --------------------
   Profile page functions
   -------------------- */
async function loadUserProfile() {
  const isLoggedIn = localStorage.getItem('isLoggedIn') === 'true';
  const email = localStorage.getItem('email');
  if (!isLoggedIn || !email) {
    // not logged in - redirect to login
    location.href = 'login.html';
    return;
  }

  // Try to load from localStorage first
  const nameEl = qs('#profileName');
  if (nameEl) nameEl.textContent = localStorage.getItem('fullName') || 'Loading...';

  // Also fetch fresh profile from server to ensure sync
  try {
    const res = await fetch('/profile', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ email })
    });
    if (res.ok) {
      const donor = await res.json();
      // Save to localStorage
      for (const k in donor) {
        if (donor[k] !== undefined && donor[k] !== null) localStorage.setItem(k, String(donor[k]));
      }
      // Populate UI
      populateProfileUI(donor);
    } else {
      // leave local values
      populateProfileUI({
        fullName: localStorage.getItem('fullName') || 'N/A',
        email,
        phone: localStorage.getItem('phone') || '',
        bloodType: localStorage.getItem('bloodType') || '--',
        age: localStorage.getItem('age') || '--',
        gender: localStorage.getItem('gender') || '--',
        fullAddress: localStorage.getItem('fullAddress') || '--',
        medicalConditions: localStorage.getItem('medicalConditions') || '--',
        lastDonation: localStorage.getItem('lastDonation') || 'Never',
        isOrganDonor: localStorage.getItem('isOrganDonor') || '0',
        isAvailable: localStorage.getItem('isAvailable') || '1'
      });
    }
  } catch (err) {
    console.error('loadUserProfile network error', err);
    // still populate from localStorage if available
    populateProfileUI({
      fullName: localStorage.getItem('fullName') || 'N/A',
      email,
      phone: localStorage.getItem('phone') || '',
      bloodType: localStorage.getItem('bloodType') || '--',
      age: localStorage.getItem('age') || '--',
      gender: localStorage.getItem('gender') || '--',
      fullAddress: localStorage.getItem('fullAddress') || '--',
      medicalConditions: localStorage.getItem('medicalConditions') || '--',
      lastDonation: localStorage.getItem('lastDonation') || 'Never',
      isOrganDonor: localStorage.getItem('isOrganDonor') || '0',
      isAvailable: localStorage.getItem('isAvailable') || '1'
    });
  }
}

async function loadAvailableDonors() {
    const donorsDisplay = document.querySelector(".donors-display-area");
    const noDonorsMessage = document.querySelector(".no-donors-message");
    const searchInput = document.querySelector(".donors-search-bar input");
    const bloodTypeSelect = document.querySelector("select[name='blood-types']");
    const availabilitySelect = document.querySelector("select[name='availability']");

    let donorsData = [];

    try {
        const response = await fetch("/api/donors");
        const data = await response.json();

        if (!data.success || !data.donors.length) {
            if (noDonorsMessage) noDonorsMessage.style.display = "block";
            return;
        }

        donorsData = data.donors;
        renderDonors(donorsData);

        // --- Add filtering functionality ---
        searchInput.addEventListener("input", () => filterDonors());
        bloodTypeSelect.addEventListener("change", () => filterDonors());
        availabilitySelect.addEventListener("change", () => filterDonors());

        function filterDonors() {
            const query = searchInput.value.toLowerCase();
            const selectedType = bloodTypeSelect.value;
            const selectedAvailability = availabilitySelect.value;

            const filtered = donorsData.filter(donor => {
                const matchesSearch =
                    donor.name.toLowerCase().includes(query) ||
                    donor.location.toLowerCase().includes(query);
                const matchesType =
                    selectedType === "all" || donor.bloodType === selectedType;
                const matchesAvailability =
                    selectedAvailability === "all" ||
                    (selectedAvailability === "active" && donor.status === "Available") ||
                    (selectedAvailability === "organ" && donor.organDonor === "Yes");

                return matchesSearch && matchesType && matchesAvailability;
            });

            renderDonors(filtered);
        }

        function renderDonors(list) {
            donorsDisplay.innerHTML = "";

            if (list.length === 0) {
                donorsDisplay.innerHTML = `<div class="no-donors-message">No donors found for the selected filters.</div>`;
                return;
            }

            list.forEach(donor => {
                const donorCard = document.createElement("div");
                donorCard.classList.add("donor-card");
                donorCard.innerHTML = `
                    <h3>${donor.name}</h3>
                    <p><strong>Age:</strong> ${donor.age}</p>
                    <p><strong>Blood Type:</strong> ${donor.bloodType}</p>
                    <p><strong>Location:</strong> ${donor.location}</p>
                    <p><strong>Organ Donor:</strong> ${donor.organDonor}</p>
                    <span class="status ${donor.status === 'Available' ? 'active' : 'inactive'}">
                        ${donor.status}
                    </span>
                `;
                donorsDisplay.appendChild(donorCard);
            });
        }

    } catch (error) {
        console.error("Error loading donors:", error);
    }
}


function populateProfileUI(donor) {
  if (!donor) return;
  qs('#profileAvatar') && (qs('#profileAvatar').textContent = getInitials(donor.fullName || 'AS'));
  qs('#profileName') && (qs('#profileName').textContent = donor.fullName || donor.email || 'N/A');
  qs('#profileEmail') && (qs('#profileEmail').textContent = donor.email || '');
  qs('#profilePhone') && (qs('#profilePhone').textContent = donor.phone || '');
  qs('#profileBloodType') && (qs('#profileBloodType').textContent = donor.bloodType || '--');
  const cityState = donor.fullAddress ? donor.fullAddress.split(',').slice(-3,-1).join(', ') : ((donor.city && donor.state) ? `${donor.city}, ${donor.state}` : 'N/A');
  qs('#profileCityState') && (qs('#profileCityState').textContent = cityState || '');
  qs('#detailAge') && (qs('#detailAge').textContent = (donor.age ? donor.age + ' years' : '--'));
  qs('#detailGender') && (qs('#detailGender').textContent = donor.gender || '--');
  qs('#detailAddress') && (qs('#detailAddress').textContent = donor.fullAddress || '--');
  qs('#detailAvailability') && (qs('#detailAvailability').textContent = (String(donor.isAvailable || '') === '1' ? 'Available Now' : 'Within Month'));
  qs('#detailLastDonation') && (qs('#detailLastDonation').textContent = donor.lastDonation || 'Never');
  qs('#detailMedicalConditions') && (qs('#detailMedicalConditions').textContent = donor.medicalConditions || 'None');
  qs('#profileRegisteredDate') && (qs('#profileRegisteredDate').textContent = new Date().toLocaleDateString());
}

/* --------------------
   Donor list rendering
   -------------------- */
async function fetchAndRenderDonors() {
  const donorListContainer = qs('#availableDonorsList');
  const donorTableBody = qs('#donorTableBody');

  if (donorListContainer) donorListContainer.innerHTML = '';
  if (donorTableBody) donorTableBody.innerHTML = '<tr><td colspan="8">Loading...</td></tr>';

  try {
    const res = await fetch('/donors');
    const donors = await res.json();
    if (!res.ok || !Array.isArray(donors) || donors.length === 0) {
      if (donorListContainer) donorListContainer.innerHTML = '<p class="no-data-message">No donors available.</p>';
      if (donorTableBody) donorTableBody.innerHTML = '<tr><td colspan="8">No donors found.</td></tr>';
      return;
    }

    // render cards
    if (donorListContainer) {
      donorListContainer.innerHTML = '';
      donors.forEach(d => donorListContainer.appendChild(createDonorCard(d)));
    }

    if (donorTableBody) {
      donorTableBody.innerHTML = '';
      donors.forEach((d, idx) => donorTableBody.appendChild(createDonorRow(d, idx + 1)));
    }
  } catch (err) {
    console.error('fetchAndRenderDonors error', err);
    if (donorListContainer) donorListContainer.innerHTML = '<p class="error-message">Failed to load donors.</p>';
    if (donorTableBody) donorTableBody.innerHTML = '<tr><td colspan="8">Error loading donors.</td></tr>';
  }
}

function createDonorCard(d) {
  const div = document.createElement('div');
  div.className = 'donor-card';
  div.innerHTML = `
    <div class="donor-header">
      <span class="donor-initials">${getInitials(d.fullName)}</span>
      <h4 class="donor-name">${escapeHtml(d.fullName)}</h4>
    </div>
    <div class="donor-info">
      <span class="badge blood-type-badge">${escapeHtml(d.bloodType)}</span>
      ${d.organDonor === 'Yes' ? `<span class="badge organ-donor-badge">Organ Donor</span>` : ''}
    </div>
    <p class="donor-location"><i class="fas fa-map-marker-alt"></i> ${escapeHtml(d.location || '')}</p>
    <p class="donor-last-donated">Status: ${escapeHtml(d.status)}</p>
    <button class="contact-btn" data-email="${escapeHtml(d.userId || '')}">Contact</button>
  `;
  return div;
}

function createDonorRow(d, id) {
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td>${id}</td>
    <td>${escapeHtml(d.fullName)}</td>
    <td class="blood-type-column">${escapeHtml(d.bloodType)}</td>
    <td>${d.age || '--'}</td>
    <td>${escapeHtml(d.location || '--')}</td>
    <td>${escapeHtml(d.organDonor || '--')}</td>
    <td><span class="status-badge">${escapeHtml(d.status)}</span></td>
    <td><button class="contact-btn">Contact</button></td>
  `;
  return tr;
}

/* --------------------
   Requests rendering & submission
   -------------------- */
function attachRequestHandlers() {
  const requestForm = qs('#request-form');
  if (requestForm) {
    requestForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(requestForm).entries());
      try {
        const res = await fetch('/submit-request', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify(data)
        });
        const json = await res.json();
        if (res.ok) {
          alert('Request submitted!');
          requestForm.reset();
          fetchAndRenderRequests();
        } else {
          alert(json.message || 'Failed to submit request');
        }
      } catch (err) {
        console.error('submit-request error', err);
        alert('Network error submitting request');
      }
    });
  }
}

async function fetchAndRenderRequests() {
  const container = qs('.requests-display-area');
  if (!container) return;
  container.innerHTML = 'Loading...';
  try {
    const res = await fetch('/requests/active');
    const requests = await res.json();
    if (!res.ok || !Array.isArray(requests) || requests.length === 0) {
      container.innerHTML = '<p class="no-data-message">No active requests at the moment.</p>';
      return;
    }
    container.innerHTML = '';
    requests.forEach(r => {
      const card = createRequestCard(r);
      container.prepend(card);
    });
  } catch (err) {
    console.error('fetchAndRenderRequests error', err);
    container.innerHTML = '<p class="error-message">Failed to load active requests.</p>';
  }
}

function createRequestCard(r) {
  const div = document.createElement('div');
  div.className = 'request-card';
  div.innerHTML = `
    ${r.urgencyLevel === 'Critical' ? '<span class="critical-tag">CRITICAL NEED</span>' : ''}
    <div class="request-header-content">
      <i class="fas fa-notes-medical request-icon"></i>
      <div>
        <p class="request-hospital">${escapeHtml(r.hospitalName)}</p>
        <h3 class="request-item-needed">${r.requestType === 'Blood' ? escapeHtml(r.bloodType + ' Blood') : escapeHtml(r.organType + ' Organ')}</h3>
      </div>
    </div>
    <div class="request-details">
      <div class="detail-item"><p>Urgency:</p><span class="urgency-level">${escapeHtml(r.urgencyLevel)}</span></div>
      <div class="detail-item"><p>Patient Blood Type:</p><span>${escapeHtml(r.patientBloodType || 'N/A')}</span></div>
      <div class="detail-item"><p>Contact:</p><a href="tel:${r.contactNumber}">${escapeHtml(r.contactNumber)}</a></div>
    </div>
    <button class="btn-action-view">Find Match</button>
  `;
  return div;
}

/* --------------------
   Organ availability
   -------------------- */
function attachOrganHandlers() {
  const organForm = qs('#organ-availability-form');
  if (organForm) {
    organForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      // prefer a stored email (user must be logged in)
      const storedEmail = localStorage.getItem('email');
      if (!storedEmail) {
        alert('You must be logged in to submit organ availability.');
        location.href = 'login.html';
        return;
      }
      const data = Object.fromEntries(new FormData(organForm).entries());
      data.donorEmail = storedEmail;
      try {
        const res = await fetch('/add-organ', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify(data)
        });
        const json = await res.json();
        if (res.ok) {
          alert('Organ availability submitted');
          organForm.reset();
          fetchAndRenderOrganAvailability();
        } else {
          alert(json.message || 'Failed to submit organ availability');
        }
      } catch (err) {
        console.error('add-organ error', err);
        alert('Network error submitting organ availability');
      }
    });
  }
}

async function fetchAndRenderOrganAvailability() {
  const container = qs('#availableOrgansList');
  if (!container) return;
  container.innerHTML = 'Loading...';
  try {
    const res = await fetch('/organs');
    const organs = await res.json();
    if (!res.ok || !Array.isArray(organs) || organs.length === 0) {
      container.innerHTML = '<p class="no-data-message">No organs currently listed.</p>';
      return;
    }
    container.innerHTML = '';
    organs.forEach(o => container.appendChild(createOrganCard(o)));
  } catch (err) {
    console.error('fetchAndRenderOrganAvailability error', err);
    container.innerHTML = '<p class="error-message">Failed to load organ availability.</p>';
  }
}

function createOrganCard(o) {
  const div = document.createElement('div');
  div.className = 'organ-card';
  const listed = o.listedDate ? new Date(o.listedDate).toLocaleDateString() : 'N/A';
  div.innerHTML = `
    <i class="fas fa-heart icon"></i>
    <div class="organ-info">
      <h4>${escapeHtml(o.organType)} <a class="view-donor-button" href="#">View Donor</a></h4>
      <p><span class="status">${escapeHtml(o.status)}</span></p>
      <p>Donor Blood Type: <span class="blood-type">${escapeHtml(o.bloodType)}</span></p>
      <p>Location: ${escapeHtml(o.location || 'N/A')}</p>
      <p>Contact: ${escapeHtml(o.contact || 'N/A')}</p>
      <p>Listed: ${listed}</p>
    </div>
  `;
  return div;
}

/* --------------------
   Inventory / stats
   -------------------- */
async function fetchInventoryStats() {
  // If homepage shows stats, try to load inventory and stats
  try {
    const res = await fetch('/api/inventory');
    if (!res.ok) return;
    const inv = await res.json();
    // Optionally update DOM if you have elements; leaving console log for debug
    console.log('Inventory:', inv);
  } catch (err) {
    console.error('fetchInventoryStats error', err);
  }
}

function goToDonorRegister() {
  window.location.href = "register.html"; // make sure the page exists in your project
}

/* --------------------
   Small helpers
   -------------------- */
function escapeHtml(s) {
  if (!s && s !== 0) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

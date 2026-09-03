document.addEventListener('DOMContentLoaded', () => {

    const chatWindow = document.getElementById('chatbotWindow');
    const openBtn = document.getElementById('openChatButton');
    const closeBtn = document.getElementById('closeChatButton');
    const chatBody = document.getElementById('chatBody');
    const chatInput = document.getElementById('chatInput');
    const sendBtn = document.getElementById('sendChatButton');

    const predefinedQuestions = [
        "Donor Registration",
        "Request Help",
        "Check Inventory",
        "Contact Info",
        "Available Donors",
        "Active Requests"
    ];

    // Utility — pick random response
    function pick(arr) {
        return arr[Math.floor(Math.random() * arr.length)];
    }

    // Intent Synonyms
    const intentMap = {

        // DONOR REGISTRATION
        "donate": "DONOR_REG", "register": "DONOR_REG",
        "sign up": "DONOR_REG", "signup": "DONOR_REG", "become": "DONOR_REG",
        "volunteer": "DONOR_REG", "eligibility": "DONOR_REG", "criteria": "DONOR_REG",

        // REQUEST HELP
        "need": "REQUEST_HELP", "blood": "REQUEST_HELP",
        "organ": "REQUEST_HELP", "emergency": "REQUEST_HELP", "urgent": "REQUEST_HELP",
        "patient": "REQUEST_HELP", "transfusion": "REQUEST_HELP", "transplant": "REQUEST_HELP",

        // INVENTORY
        "inventory": "INVENTORY", "availability": "INVENTORY", "stock": "INVENTORY",
        "check stock": "INVENTORY", "blood bank": "INVENTORY", "organ list": "INVENTORY",

        // CONTACT
        "contact": "CONTACT", "call": "CONTACT", "phone": "CONTACT", "email": "CONTACT",
        "hotline": "CONTACT", "support": "CONTACT", "assist": "CONTACT", "helpdesk": "CONTACT",

        // AVAILABLE DONORS
        "available donors": "AVAILABLE_DONORS",
        "donor list": "AVAILABLE_DONORS",
        "show donors": "AVAILABLE_DONORS",
        "see donors": "AVAILABLE_DONORS",
        "donors": "AVAILABLE_DONORS",

        // ACTIVE REQUESTS
        "active requests": "ACTIVE_REQUESTS",
        "request list": "ACTIVE_REQUESTS",
        "show requests": "ACTIVE_REQUESTS",
        "see requests": "ACTIVE_REQUESTS",
        "requests": "ACTIVE_REQUESTS",

        // GREETING
        "hello": "GREETING", "hi": "GREETING", "hey": "GREETING", "greetings": "GREETING",
        "good morning": "GREETING", "good afternoon": "GREETING", "good evening": "GREETING"
    };

    // Natural Responses
    const naturalResponses = {

        DONOR_REG: [
            `
            <p>Great choice! Ready to save a life?</p>
            <button class="action-response-btn" onclick="goToDonorRegister()">
                🩸 Register as a Donor
            </button>
            `
        ],

        REQUEST_HELP: [
            `
            <p>This sounds serious. Here’s the urgent request form:</p>
            <button class="action-response-btn" onclick="openModal('requestBloodModal')">
                🚑 Submit Request
            </button>
            `
        ],

        INVENTORY: [
            `<p>Scroll to the Inventory section below for full details.</p>`
        ],

        CONTACT: [
            `<p>📞 Hotline: +1-800-BLOOD<br>📧 urgent@lifelink.org</p>`
        ],

        GREETING: [
            `
            <p>👋 Hello! I'm your Lifelink assistant.</p>
            <ul>
                <li>🩸 Donor Registration</li>
                <li>🚑 Make a Request</li>
                <li>👥 Available Donors</li>
                <li>📢 Active Requests</li>
            </ul>
            `
        ],

        // ⭐ AVAILABLE DONORS → scroll in SAME page
        AVAILABLE_DONORS: [
            `
            <p>Here are the available donors:</p>
            <button class="action-response-btn" onclick="scrollToSection('available-donors-section')">
                👥 View Available Donors
            </button>
            `
        ],

        // ⭐ ACTIVE REQUESTS → scroll in SAME page
        ACTIVE_REQUESTS: [
            `
            <p>Here are all active requests:</p>
            <button class="action-response-btn" onclick="scrollToSection('requests-section')">
                📢 View Active Requests
            </button>
            `
        ],

        DEFAULT: [
            "Hmm, I didn’t fully get that. Could you try rephrasing?",
            "I'm not sure I understood… want to try saying it differently?"
        ]
    };

    // ---------------- NLP ENGINE ----------------

    function nlpMatchIntent(userInput) {
        const input = userInput.toLowerCase().trim();
        const tokens = input.split(/\s+/);

        let bestIntent = null;
        let bestScore = 0;

        for (const phrase in intentMap) {
            const intent = intentMap[phrase];

            if (input.includes(phrase)) return intent;

            for (const token of tokens) {
                const similarity = stringSimilarity(token, phrase);
                if (similarity > bestScore) {
                    bestScore = similarity;
                    bestIntent = intent;
                }
            }
        }

        return bestScore >= 0.55 ? bestIntent : null;
    }

    function stringSimilarity(a, b) {
        const distance = levenshtein(a, b);
        const maxLen = Math.max(a.length, b.length);
        return 1 - (distance / maxLen);
    }

    function levenshtein(a, b) {
        const matrix = [];
        for (let i = 0; i <= b.length; i++) matrix[i] = [i];
        for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

        for (let i = 1; i <= b.length; i++) {
            for (let j = 1; j <= a.length; j++) {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j - 1] + (a[j - 1] === b[i - 1] ? 0 : 1)
                );
            }
        }
        return matrix[b.length][a.length];
    }

    // Find Intent
    function findIntent(userInput) {
        const nlpIntent = nlpMatchIntent(userInput);
        if (nlpIntent) return nlpIntent;

        const lowerInput = userInput.toLowerCase();
        for (const phrase in intentMap) {
            if (lowerInput.includes(phrase)) return intentMap[phrase];
        }
        return "DEFAULT";
    }

    // Generate Response
    function getBotResponse(userInput) {
        const intent = findIntent(userInput);
        const responses = naturalResponses[intent] || naturalResponses.DEFAULT;
        return pick(responses);
    }

    // ---------------- UI ----------------

    if (openBtn && chatWindow) {
        const toggleChatWindow = () => {
            const isHidden = chatWindow.style.display === 'none' || chatWindow.style.display === '';
            if (isHidden) {
                chatWindow.style.display = 'flex';
                openBtn.style.display = 'none';
                chatInput.focus();
                showWelcomeMessageAndButtons();
            } else {
                chatWindow.style.display = 'none';
                openBtn.style.display = 'block';
            }
        };

        openBtn.addEventListener('click', toggleChatWindow);
        closeBtn.addEventListener('click', toggleChatWindow);
    }

    function addMessage(text, isUser) {
        const messageDiv = document.createElement('p');
        messageDiv.classList.add(isUser ? 'user-message-style' : 'bot-message-style');
        messageDiv.innerHTML = isUser ? text : text;
        chatBody.appendChild(messageDiv);
        chatBody.scrollTop = chatBody.scrollHeight;
    }

    function showWelcomeMessageAndButtons() {
        chatBody.innerHTML = `
            <p class="bot-message-style">Hello! I'm Lifelink Bot. How can I assist you?</p>
            <div class="quick-questions-container">
                ${predefinedQuestions.map(q =>
                    `<button class="quick-question-btn" data-keyword="${q}">${q}</button>`
                ).join('')}
            </div>
        `;

        document.querySelectorAll('.quick-question-btn').forEach(button => {
            button.addEventListener('click', function () {
                const userKeyword = this.getAttribute('data-keyword');
                document.querySelector('.quick-questions-container').remove();
                processBotResponse(userKeyword);
            });
        });
    }

    function sendMessage() {
        const userInput = chatInput.value.trim();
        if (userInput === '') return;

        addMessage(userInput, true);
        chatInput.value = '';
        processBotResponse(userInput);
    }

    function processBotResponse(userInput) {
        setTimeout(() => {
            const botResponse = getBotResponse(userInput);
            addMessage(botResponse, false);
        }, 500);
    }

    sendBtn.addEventListener('click', sendMessage);
    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            sendMessage();
        }
    });

    // Initial welcome
    showWelcomeMessageAndButtons();

    // Smooth Scroll Function
    window.scrollToSection = function (sectionId) {
        const section = document.getElementById(sectionId);
        if (section) section.scrollIntoView({ behavior: "smooth" });
    }

    window.openModal = function (id) {
        const modal = document.getElementById(id);
        if (modal) modal.style.display = 'flex';
    }

    window.closeModal = function (id) {
        const modal = document.getElementById(id);
        if (modal) modal.style.display = 'none';
    }

});

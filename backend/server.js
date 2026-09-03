// server.js (FINAL UPDATED VERSION WITH SQL FIXES)

const express = require('express');
const path = require('path');
// Using 'better-sqlite3' for robust synchronous transactions
const Database = require('better-sqlite3'); 
const app = express();
const PORT = 3000;

// --- Middlewares ---
// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));
// Middleware to parse JSON and URL-encoded data
app.use(express.json());
app.use(express.urlencoded({ extended: true }));


// --- 1. Database Setup (SQLite) ---
// Initialize the database connection
// The { verbose: console.log } prints SQL statements, useful for debugging
const db = new Database('lifelink.db', { verbose: console.log });

function initializeDatabase() {
    console.log('Initializing database tables...');

    db.exec(`
    /* 1. USERS TABLE: For login and basic authentication */
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL, /* Used for login (email) */
        email TEXT UNIQUE NOT NULL,    /* Explicitly storing email */
        password TEXT NOT NULL,
        role TEXT DEFAULT 'donor'
    );

    /* 2. DONORS TABLE: For detailed medical and contact info */
    CREATE TABLE IF NOT EXISTS donors (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId INTEGER UNIQUE NOT NULL, /* Foreign key to users table */
        fullName TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        phone TEXT NOT NULL,
        bloodType TEXT NOT NULL,
        age INTEGER,
        gender TEXT,
        city TEXT,
        state TEXT,
        fullAddress TEXT,
        lastDonation DATE,
        isOrganDonor BOOLEAN,
        medicalConditions TEXT,
        isAvailable BOOLEAN,
        FOREIGN KEY (userId) REFERENCES users(id)
    );

    /* 3. INVENTORY TABLE: For tracking blood stock units */
    CREATE TABLE IF NOT EXISTS inventory (
        bloodType TEXT PRIMARY KEY,
        currentUnits INTEGER NOT NULL,
        maxCapacity INTEGER NOT NULL,
        urgencyLevel TEXT
    );

    /* 4. REQUESTS TABLE: For hospital requests (Blood/Organ) */
    CREATE TABLE IF NOT EXISTS requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        requestType TEXT NOT NULL,
        bloodType TEXT,
        organType TEXT,
        hospitalName TEXT NOT NULL,
        patientBloodType TEXT,
        urgencyLevel TEXT NOT NULL,
        contactNumber TEXT NOT NULL,
        status TEXT DEFAULT 'Pending'
    ); /* <-- SEMICOLON ADDED HERE TO PREVENT CONFLICTS */
    
    /* 5. ORGAN AVAILABILITY TABLE: For listing available organs */
    CREATE TABLE IF NOT EXISTS organ_availability (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        donorEmail TEXT NOT NULL,       /* Links to the donor */
        organType TEXT NOT NULL,        /* e.g., Kidney, Liver */
        bloodType TEXT NOT NULL,        /* Donor's blood type */
        status TEXT DEFAULT 'Available',  /* Available, Reserved, Donated */
        location TEXT,                  /* Donor city/state */
        contact TEXT,                   /* Donor phone (or email) */
        listedDate DATETIME DEFAULT CURRENT_TIMESTAMP, /* Corrected column */
        FOREIGN KEY (donorEmail) REFERENCES donors(email)
    );
`);

    // Insert initial inventory data if table is empty
    const checkInventory = db.prepare("SELECT COUNT(*) FROM inventory").get();
    if (checkInventory['COUNT(*)'] === 0) {
        console.log('Inserting initial inventory data...');
        const insert = db.prepare("INSERT INTO inventory (bloodType, currentUnits, maxCapacity, urgencyLevel) VALUES (?, ?, ?, ?)");
        insert.run('O+', 60, 100, 'Standard');
        insert.run('O-', 10, 50, 'Critical');
        insert.run('A+', 45, 100, 'Standard');
        insert.run('A-', 12, 50, 'Urgent');
        insert.run('B+', 38, 100, 'Standard');
        insert.run('B-', 8, 50, 'Urgent');
        insert.run('AB+', 25, 75, 'Standard');
        insert.run('AB-', 5, 25, 'Critical');
    }

    console.log('Database initialization complete.');
}

initializeDatabase();


// ==========================================
// 2. API Endpoints: User Authentication & Registration
// ==========================================

// 2.1 USER REGISTRATION 
app.post('/register', (req, res) => { 
    // Collect ALL fields from register.html
    const { 
        username, password, fullName, phone, bloodType, age, gender, 
        fullAddress, medicalConditions, isOrganDonor 
    } = req.body;

    // Check for required fields
    if (!username || !password || !fullName || !phone || !bloodType || !age || !gender || !fullAddress || !medicalConditions) {
        console.log("Missing required fields:", req.body);
        return res.status(400).json({ success: false, message: 'All fields are required. Please check your form submission.' });
    }

    // --- 1. DEFINE THE TRANSACTION FUNCTION ---
    const registerTransaction = db.transaction((registrationData) => {
        // NOTE: registrationData is the data passed when registerTransaction() is called.
        const { username, password, fullName, phone, bloodType, age, gender, fullAddress, medicalConditions, isOrganDonor } = registrationData;
        
        // --- Step 1: Insert into Users Table (Authentication) ---
        const userInsertStmt = db.prepare(`
            INSERT INTO users (username, email, password, role) 
            VALUES (?, ?, ?, 'donor')
        `);
        const userResult = userInsertStmt.run(username, username, password); 
        const newUserId = userResult.lastInsertRowid;

        // --- Step 2: Extract City and State for donor table ---
        const addressParts = fullAddress.split(',').map(part => part.trim());
        // This logic is fragile but kept for now. It assumes format: "Address line, City, State, Country"
        const state = addressParts[addressParts.length - 2] || 'N/A'; 
        const city = addressParts[addressParts.length - 3] || 'N/A';
        
        // --- Step 3: Insert into Donors Table (Profile Data) ---
        const donorInsertStmt = db.prepare(`
            INSERT INTO donors (
                userId, fullName, email, phone, bloodType, age, gender, city, state, fullAddress, 
                lastDonation, isOrganDonor, medicalConditions, isAvailable
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const isOrganDonorValue = isOrganDonor ? 1 : 0;
        
        donorInsertStmt.run(
            newUserId, 
            fullName, 
            username, 
            phone, 
            bloodType, 
            age, 
            gender, 
            city, 
            state, 
            fullAddress, 
            'Never', 
            isOrganDonorValue, 
            medicalConditions, 
            1 // isAvailable
        );
        
        // Return a successful result object
        return { success: true, message: 'Registration successful! Your profile is ready.' };
    });
    
    // --- 2. EXECUTE THE TRANSACTION AND HANDLE RESPONSE ---
    try {
        const result = registerTransaction(req.body);
        res.status(201).json(result); // Return success to client

    } catch (error) {
        // Handle common errors (like duplicate username/email)
        if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            console.error('Registration failed: Email/Username already exists.');
            return res.status(409).json({ success: false, message: 'A user with this email already exists.' });
        }
        
        console.error('Database transaction failed during registration:', error);
        res.status(500).json({ success: false, message: 'Server error during registration. Check server console.' });
    }
});

// server.js: 2.2 USER LOGIN 
app.post('/login', (req, res) => { 
    const { username, password } = req.body;
    
    // Check if required fields are present
    if (!username || !password) {
        return res.status(400).json({ message: 'Username and password are required.' });
    }

    // Begin a transaction to ensure atomic execution
    const loginTransaction = db.transaction(() => {
        
        // 1. Verify User Credentials in the 'users' table
        const userStmt = db.prepare(`
            SELECT id, role FROM users WHERE username = ? AND password = ?
        `);
        const user = userStmt.get(username, password);

        if (!user) {
            // Throw an error that the catch block will convert to a 401 response
            throw new Error('INVALID_CREDENTIALS');
        }

        // 2. Retrieve the complete profile from the 'donors' table
        // We use the username (which is the email) to link to the donor profile.
        const profileStmt = db.prepare(`
            SELECT 
                fullName, phone, bloodType, age, gender, 
                fullAddress, medicalConditions, isOrganDonor, lastDonation, isAvailable, 
                city, state
            FROM donors
            WHERE email = ?
        `);
        const profile = profileStmt.get(username);
        
        if (!profile) {
            // This case means user exists, but donor profile was never created (e.g., failed registration)
            throw new Error('PROFILE_MISSING');
        }

        // 3. Assemble the final data object for the client
        const userData = {
            // Core Auth
            userId: user.id, // Store ID for potential server use
            email: username, 
            role: user.role,

            // Profile Data (All fields required for main.js to store in localStorage)
            ...profile
        };

        return { message: 'Login successful!', user: userData };
    });

    // --- Execute the Transaction and Handle Errors ---
    try {
        const result = loginTransaction();
        res.status(200).json(result);

    } catch (error) {
        if (error.message === 'INVALID_CREDENTIALS') {
            return res.status(401).json({ message: 'Invalid username or password.' });
        }
        if (error.message === 'PROFILE_MISSING') {
            console.error(`Login successful but profile missing for: ${username}`);
            return res.status(404).json({ message: 'Login successful, but profile data is incomplete. Please contact support.' });
        }

        console.error('Server error during login transaction:', error);
        res.status(500).json({ message: 'Server failed to process login request.' });
    }
});

// server.js: 2.3 PROFILE UPDATE ROUTE
// ✅ FIX: Route changed to /update-profile
app.post('/update-profile', (req, res) => { 
    // The client sends the user's 'email' as the identifier
    const { 
        email, fullName, phone, bloodType, age, gender, 
        fullAddress, medicalConditions, isOrganDonor, lastDonation 
    } = req.body;

    if (!email) {
        return res.status(400).json({ success: false, message: 'User identifier (email) is missing.' });
    }

    try {
        // Use a transaction for reliability, although one statement is fine here
        db.transaction(() => {
            // Update the donors table using the email as the unique key
            const updateStmt = db.prepare(`
                UPDATE donors
                SET 
                    fullName = ?,
                    phone = ?,
                    bloodType = ?,
                    age = ?,
                    gender = ?,
                    fullAddress = ?,
                    medicalConditions = ?,
                    isOrganDonor = ?,
                    lastDonation = ?
                WHERE email = ?
            `);

            const result = updateStmt.run(
                fullName, 
                phone, 
                bloodType, 
                age, 
                gender, 
                fullAddress, 
                medicalConditions, 
                isOrganDonor, // This is 1 or 0 from client
                lastDonation,
                email // WHERE clause
            );

            if (result.changes === 0) {
                 // Throw an error if no row was updated
                 throw new Error('NO_PROFILE_FOUND');
            }

        })(); // Execute the transaction

        res.status(200).json({ success: true, message: 'Profile updated successfully!' });

    } catch (error) {
        if (error.message === 'NO_PROFILE_FOUND') {
            return res.status(404).json({ success: false, message: 'Donor profile not found for this email.' });
        }
        console.error('Database error during profile update:', error);
        res.status(500).json({ success: false, message: 'Server failed to save profile changes.' });
    }
});
// ==========================================
// 3. API Endpoints: Data Retrieval & Requests
// ==========================================

// --- 3.1 Donor List Retrieval (GET) ---
// ✅ FIX: Route changed to /donors
app.get('/donors', (req, res) => { 
    // Select essential information for a public list view
    const sql = `
        SELECT 
            d.fullName, d.age, d.bloodType, d.isOrganDonor, 
            d.city AS location, d.isAvailable AS status,
            u.id AS userId
        FROM donors d
        JOIN users u ON d.userId = u.id
        ORDER BY d.fullName ASC;
    `;

    try {
        const rows = db.prepare(sql).all();
        // Convert boolean-like values and match client field names
        const processedRows = rows.map(row => ({
            userId: row.userId, 
            fullName: row.fullName, 
            age: row.age,
            bloodType: row.bloodType,
            organDonor: row.isOrganDonor ? 'Yes' : 'No',
            location: row.location,
            status: row.status ? 'Available' : 'Within Month', 
        }));
        res.json(processedRows);
    } catch (err) {
        console.error('Database error fetching donors:', err.message);
        return res.status(500).json({ error: "Failed to fetch donor list." });
    }
});


// --- 3.2 Request Submission (POST) ---
// ✅ FIX: Route changed to /submit-request
app.post('/submit-request', (req, res) => { 
    const request = req.body;
    
    // --- (Validation remains the same) ---
    if (!request.requestType || !request.hospitalName || !request.urgency || !request.contactNumber) {
        return res.status(400).json({ 
            success: false, 
            message: 'Missing required request fields: Request Type, Hospital Name, Urgency, and Contact Number must be provided.' 
        });
    }

    let bloodTypeVal = null;
    let organTypeVal = null;

    if (request.requestType === 'Blood') {
        bloodTypeVal = request.requestBloodType || null;
        if (!bloodTypeVal) {
             return res.status(400).json({ success: false, message: 'Blood request requires a specific blood type.' });
        }
    } else if (request.requestType === 'Organ') {
        organTypeVal = request.requestOrganType || null;
        if (!organTypeVal) {
            return res.status(400).json({ success: false, message: 'Organ request requires a specific organ type.' });
        }
    }
    
    const urgencyLevelVal = request.urgency; 
    const patientBloodTypeVal = request.patientBloodType || 'Unknown';
    // --- (End Validation/Mapping) ---


    try {
        const stmt = db.prepare(`
            INSERT INTO requests (
                requestType, 
                bloodType, 
                organType, 
                hospitalName, 
                patientBloodType, 
                urgencyLevel, 
                contactNumber,
                status 
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?) 
        `);
        
        const result = stmt.run(
            request.requestType,
            bloodTypeVal,
            organTypeVal,
            request.hospitalName,
            patientBloodTypeVal,
            urgencyLevelVal,
            request.contactNumber,
            'Pending' 
        );

        res.status(201).json({
            success: true,
            message: 'Request submitted successfully!',
            requestId: result.lastInsertRowid
        });
        
    } catch (error) {
        console.error('Database error during request submission (Final Check):', error.message); 
        res.status(500).json({ success: false, message: 'Internal server error during request submission. Check server logs for exact DB error.' });
    }
});

// --- 3.3 Active Requests Retrieval (GET) ---
// ✅ FIX: Route changed to /requests/active
app.get('/requests/active', (req, res) => { 
    try {
        // Query to select all requests that are still marked as 'Pending'
        const requests = db.prepare("SELECT * FROM requests WHERE status = 'Pending' ORDER BY id DESC").all();
        
        // Return the retrieved data as JSON
        res.json(requests);
    } catch (error) {
        console.error('Database error retrieving active requests:', error.message); 
        // Send a 500 status code back to the client if the database query fails
        res.status(500).json({ message: 'Internal server error retrieving active requests.' });
    }
});

// --- 3.4 Inventory Data Retrieval (GET) ---
app.get('/api/inventory', (req, res) => {
    try {
        const inventory = db.prepare("SELECT * FROM inventory").all();
        res.json(inventory);
    } catch (error) {
        console.error('Database error retrieving inventory:', error);
        res.status(500).json({ message: 'Internal server error retrieving inventory data.' });
    }
});

// --- 3.5 Single Donor Profile Retrieval (POST/GET) ---
// ✅ FIX: Route changed to POST /profile
app.post('/profile', (req, res) => {
    // The client is expected to send the email in the request body for POST
    const userEmail = req.body.email; 
    
    if (!userEmail) {
        return res.status(400).json({ message: 'Email parameter is required.' });
    }

    try {
        const donor = db.prepare(`
            SELECT 
                fullName, email, phone, bloodType, age, gender, city, state, fullAddress, 
                lastDonation, isOrganDonor, medicalConditions, isAvailable
            FROM donors 
            WHERE email = ?
        `).get(userEmail);
        
        if (donor) {
            res.json(donor);
        } else {
            res.status(404).json({ message: 'Donor profile not found for this user.' });
        }
    } catch (error) {
        console.error('Database error retrieving single donor profile:', error);
        res.status(500).json({ message: 'Internal server error retrieving profile data.' });
    }
});

// --- 3.6 Blood Bank Inventory List Retrieval (GET /api/banks) ---
app.get('/api/banks', (req, res) => {
    try {
        const inventory = db.prepare("SELECT * FROM inventory").all();
        
        // MOCK Structure for Blood Bank Directory compatibility:
        const bankData = [
            {
                id: 1,
                name: "Central Lifelink Repository",
                city: "Regional Hub",
                state: "Global",
                phone: "(999) 555-0101",
                type: "Regional Center",
                types: inventory.map(item => ({
                    bloodType: item.bloodType,
                    units: item.currentUnits,
                    level: item.urgencyLevel
                }))
            }
        ];
        
        res.json(bankData);
    } catch (error) {
        console.error('Database error retrieving bank/inventory list:', error);
        res.status(500).json({ message: 'Internal server error retrieving bank list.' });
    }
});

// --- 3.7 General Donor List for Display (GET /api/donors) ---
// Keeping this route, though it duplicates /donors (3.1), in case the client uses both for different purposes.
app.get('/api/donors', (req, res) => {
  const sql = `
    SELECT 
        d.fullName, d.age, d.bloodType, d.isOrganDonor, 
        d.fullAddress AS location, d.isAvailable AS status,
        u.id AS userId
    FROM donors d
    JOIN users u ON d.userId = u.id
    WHERE d.isAvailable = 1  -- Only show active donors
    ORDER BY d.fullName ASC;
  `;

  try {
    const rows = db.prepare(sql).all();

    const processedRows = rows.map(row => ({
      id: row.userId,
      name: row.fullName,
      age: row.age || 'N/A',
      bloodType: row.bloodType || 'Unknown',
      organDonor: row.isOrganDonor ? 'Yes' : 'No',
      location: row.location || 'Not Provided',
      status: row.status ? 'Available' : 'Not Available'
    }));

    // ✅ Return as JSON with success flag (frontend expects this)
    res.json({ success: true, donors: processedRows });
  } catch (err) {
    console.error('Database error fetching donors:', err.message);
    res.status(500).json({ success: false, message: "Failed to fetch donor list." });
  }
});


// --- 3.8 Organ Availability Submission (POST) ---
// ✅ FIX: Route changed to /add-organ
app.post('/add-organ', (req, res) => {
    // Note: We assume the user's email is stored in localStorage and passed in the body
    const { donorEmail, organType, bloodType, location, contact } = req.body;

    if (!donorEmail || !organType || !bloodType || !contact) {
        return res.status(400).json({ success: false, message: 'Missing required fields for organ availability submission.' });
    }

    try {
        const stmt = db.prepare(`
            INSERT INTO organ_availability (donorEmail, organType, bloodType, location, contact)
            VALUES (?, ?, ?, ?, ?)
        `);
        
        const result = stmt.run(donorEmail, organType, bloodType, location, contact);

        res.status(201).json({
            success: true,
            message: 'Organ availability submitted successfully!',
            id: result.lastInsertRowid
        });

    } catch (error) {
        console.error('Database error during organ availability submission:', error);
        res.status(500).json({ success: false, message: 'Internal server error during organ submission.' });
    }
});


// --- 3.9 Organ Availability Retrieval (GET) ---
// ✅ FIX: Route changed to /organs
app.get('/organs', (req, res) => { 
    try {
        const availability = db.prepare(`
            SELECT id, organType, bloodType, status, location, contact, donorEmail, listedDate
            FROM organ_availability 
            WHERE status = 'Available'
            ORDER BY organType, bloodType
        `).all();
        
        res.json(availability);
    } catch (error) {
        console.error('Database error retrieving organ availability list:', error);
        res.status(500).json({ message: 'Internal server error retrieving organ list.' });
    }
});

// --- 3.10 Live Statistics Retrieval (GET) ---
app.get('/api/stats/live', (req, res) => {
    try {
        // Use a transaction to ensure all counts are fetched at the same time
        const statsTransaction = db.transaction(() => {
            // 1. Registered Donors (from users table with 'donor' role)
            const registeredDonors = db.prepare("SELECT COUNT(id) AS count FROM users WHERE role = 'donor'").get().count;

            // 2. Active Requests (from requests table with status 'Pending')
            const activeRequests = db.prepare("SELECT COUNT(id) AS count FROM requests WHERE status = 'Pending'").get().count;

            // 3. Blood Donations (We will count 'lastDonation' dates that are not 'Never')
            const bloodDonations = db.prepare("SELECT COUNT(id) AS count FROM donors WHERE lastDonation IS NOT NULL AND lastDonation != 'Never'").get().count;

            // 4. Organ Donors (from donors table where isOrganDonor is true/1)
            const organDonors = db.prepare("SELECT COUNT(id) AS count FROM donors WHERE isOrganDonor = 1").get().count;

            // 5. Successful Match Rate (MOCK for now, as match logic is complex)
            const successfulMatchRate = 98; // MOCK

            return {
                registeredDonors,
                activeRequests,
                bloodDonations,
                organDonors,
                successfulMatchRate
            };
        });

        const liveStats = statsTransaction();
        res.json(liveStats);

    } catch (error) {
        console.error('Database error retrieving live statistics:', error);
        res.status(500).json({ message: 'Internal server error retrieving live statistics.' });
    }
});


// --- 4. Static File Server (Handles root URL) ---
app.get('/', (req, res) => {
    // Redirect to the login page first.
    res.redirect('/login.html');
});

// --- 5. Start Server ---
app.listen(PORT, () => {
    console.log(`\nServer is running at http://localhost:${PORT}`);
    console.log('Use http://localhost:3000/ to access the login page.\n');
});
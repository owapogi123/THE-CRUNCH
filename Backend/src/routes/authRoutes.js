const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const db = require('../config/db');

// REGISTER - Save to Admin table
router.post('/register', async (req, res) => {
    try {
        // the frontend sends `name` field, older code used `username`
        const { name, username, password, email } = req.body;
        const userName = name || username; // tolerate either

        // check missing fields
        if (!userName || !password || !email) {
            return res.status(400).json({ message: "Name, email, and password required" });
        }

        // check if email already exists
        const [existing] = await db.query(
            'SELECT Admin_ID FROM Admin WHERE Email = ?',
            [email]
        );
        if (existing.length > 0) {
            return res.status(400).json({ message: "Email already registered" });
        }

        // hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // save user to Admin table
        const [result] = await db.query(
            'INSERT INTO Admin (UserName, Email, Password) VALUES (?, ?, ?)',
            [userName, email, hashedPassword]
        );

        res.status(201).json({
            message: "User registered successfully",
            userId: result.insertId
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server error", error: error.message });
    }
});

// LOGIN - Validate against Admin table
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        // check missing fields
        if (!username || !password) {
            return res.status(400).json({ message: "Username and password required" });
        }

        // query Admin table by email (username field in frontend = email)
        const [rows] = await db.query(
            'SELECT Admin_ID, UserName, Email, Password FROM Admin WHERE Email = ?',
            [username]
        );

        if (rows.length === 0) {
            return res.status(400).json({ message: "Invalid credentials" });
        }

        const user = rows[0];

        // validate password
        const validPassword = await bcrypt.compare(password, user.Password);
        if (!validPassword) {
            return res.status(400).json({ message: "Invalid credentials" });
        }

        // create JWT token
        const token = jwt.sign(
            { userId: user.Admin_ID, username: user.UserName, email: user.Email },
            "secretkey",
            { expiresIn: "1h" }
        );

        res.json({
            message: "Login successful",
            token: token,
            userId: user.Admin_ID,
            username: user.UserName,
            email: user.Email
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server error", error: error.message });
    }
});

module.exports = router;
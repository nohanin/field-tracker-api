// database.js - PostgreSQL connection setup

const { Pool } = require('pg');
require('dotenv').config();

// Database configuration
const dbConfig = {
    host: process.env.DB_HOST || 'field-tracker-db.postgres.database.azure.com',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'fieldtracker',
    user: process.env.DB_USER || 'ufoadmin',
    password: process.env.DB_PASSWORD || 'Dh00pr3n@th@Do0m',
    ssl: {
        rejectUnauthorized: false // Required for Azure PostgreSQL
    },
    max: 20, // Maximum number of clients in the pool
    idleTimeoutMillis: 30000, // How long a client is allowed to remain idle
    connectionTimeoutMillis: 2000, // How long to wait when connecting
};

// Create connection pool
const pool = new Pool(dbConfig);

// Test connection
pool.on('connect', () => {
    console.log('✅ Connected to PostgreSQL database');
});

pool.on('error', (err) => {
    console.error('❌ PostgreSQL connection error:', err);
});

// Database helper functions
const db = {
    // Execute query
    async query(text, params) {
        const start = Date.now();
        try {
            const res = await pool.query(text, params);
            const duration = Date.now() - start;
            console.log(`📊 Query executed: ${duration}ms`, { text, rows: res.rowCount });
            return res;
        } catch (error) {
            console.error('❌ Database query error:', error);
            throw error;
        }
    },

    // Get a client from the pool
    async getClient() {
        return await pool.connect();
    },

    // Close the pool
    async close() {
        await pool.end();
        console.log('🔒 Database connection pool closed');
    }
};

// Employee-related database functions
const employeeDb = {
    // Get employee by ID
    async getById(id) {
        const query = 'SELECT * FROM employees WHERE id = $1 AND is_active = true';
        const result = await db.query(query, [id]);
        return result.rows[0];
    },

    // Get employee by email
    async getByEmail(email) {
        const query = 'SELECT * FROM employees WHERE email = $1 AND is_active = true';
        const result = await db.query(query, [email]);
        return result.rows[0];
    },

    // Verify employee pin
    async verifyPin(id, pin) {
        const query = 'SELECT id, name, email FROM employees WHERE id = $1 AND pin_code = $2 AND is_active = true';
        const result = await db.query(query, [id, pin]);
        return result.rows[0];
    },

    // Get all active employees
    async getAll() {
        const query = 'SELECT id, name, email, phone, assigned_location_id FROM employees WHERE is_active = true ORDER BY name';
        const result = await db.query(query);
        return result.rows;
    }
};

// Attendance-related database functions
const attendanceDb = {
    // Check if employee already checked in today
    async getTodayAttendance(employeeId) {
        const query = `
            SELECT * FROM attendance 
            WHERE employee_id = $1 
            AND attendance_date = CURRENT_DATE
        `;
        const result = await db.query(query, [employeeId]);
        return result.rows[0];
    },

    // Record check-in
    async checkIn(employeeId, latitude, longitude, locationVerified = false) {
        const query = `
            INSERT INTO attendance (
                employee_id, attendance_date, check_in_time, 
                check_in_latitude, check_in_longitude, location_verified
            ) VALUES ($1, CURRENT_DATE, CURRENT_TIMESTAMP, $2, $3, $4)
            RETURNING id, employee_id, attendance_date, check_in_time, 
                     check_in_latitude, check_in_longitude, location_verified
        `;
        const result = await db.query(query, [employeeId, latitude, longitude, locationVerified]);
        return result.rows[0];
    },

    // Record check-out
    async checkOut(employeeId, latitude, longitude) {
        const query = `
            UPDATE attendance 
            SET check_out_time = CURRENT_TIMESTAMP,
                check_out_latitude = $2,
                check_out_longitude = $3,
                total_hours = EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - check_in_time)) / 3600,
                updated_at = CURRENT_TIMESTAMP
            WHERE employee_id = $1 
            AND attendance_date = CURRENT_DATE
            AND check_out_time IS NULL
            RETURNING id, employee_id, attendance_date, check_in_time, check_out_time,
                     check_in_latitude, check_in_longitude, check_out_latitude, 
                     check_out_longitude, total_hours, location_verified
        `;
        const result = await db.query(query, [employeeId, latitude, longitude]);
        return result.rows[0];
    },

    // Get employee attendance history
    async getHistory(employeeId, limit = 30) {
        const query = `
            SELECT 
                id,
                attendance_date,
                check_in_time,
                check_out_time,
                check_in_latitude,
                check_in_longitude,
                check_out_latitude,
                check_out_longitude,
                total_hours,
                location_verified
            FROM attendance 
            WHERE employee_id = $1 
            ORDER BY attendance_date DESC 
            LIMIT $2
        `;
        const result = await db.query(query, [employeeId, limit]);
        return result.rows;
    },

    // Get attendance by date range
    async getByDateRange(employeeId, startDate, endDate) {
        const query = `
            SELECT * FROM attendance 
            WHERE employee_id = $1 
            AND attendance_date BETWEEN $2 AND $3
            ORDER BY attendance_date DESC
        `;
        const result = await db.query(query, [employeeId, startDate, endDate]);
        return result.rows;
    }
};

// Location-related database functions
const locationDb = {
    // Get location by ID
    async getById(id) {
        const query = 'SELECT * FROM locations WHERE id = $1';
        const result = await db.query(query, [id]);
        return result.rows[0];
    },

    // Get all locations
    async getAll() {
        const query = 'SELECT * FROM locations ORDER BY name';
        const result = await db.query(query);
        return result.rows;
    },

    // Check if coordinates are within location radius
    async isWithinLocation(latitude, longitude, locationId) {
        const query = `
            SELECT 
                id,
                name,
                (6371 * acos(
                    cos(radians($1)) * cos(radians(latitude)) * 
                    cos(radians(longitude) - radians($2)) + 
                    sin(radians($1)) * sin(radians(latitude))
                )) * 1000 as distance_meters
            FROM locations 
            WHERE id = $3
        `;
        const result = await db.query(query, [latitude, longitude, locationId]);
        const location = result.rows[0];
        
        if (!location) return null;
        
        return {
            ...location,
            isWithinRadius: location.distance_meters <= location.radius_meters
        };
    }
};

// Test database connection
async function testConnection() {
    try {
        const result = await db.query('SELECT NOW() as current_time, version() as version');
        console.log('🔌 Database connection test successful:');
        console.log('   Time:', result.rows[0].current_time);
        console.log('   Version:', result.rows[0].version.split(',')[0]);
        return true;
    } catch (error) {
        console.error('❌ Database connection test failed:', error.message);
        return false;
    }
}

module.exports = {
    db,
    employeeDb,
    attendanceDb,
    locationDb,
    testConnection,
    pool
};
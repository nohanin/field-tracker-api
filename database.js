// Updated database.js - Modified for multiple check-ins
const { Pool } = require('pg');
require('dotenv').config();

// Database connection configuration with Azure-friendly settings
const dbConfig = {
  host: process.env.DB_HOST || 'field-tracker-db.postgres.database.azure.com',
  port: parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME || 'fieldtracker',
  user: process.env.DB_USER || 'ufoadmin',
  password: process.env.DB_PASSWORD,
  ssl: {
    rejectUnauthorized: false
  },
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000, // Increased for Azure
};

// Log configuration for debugging (without password)
console.log('Database configuration:', {
  host: dbConfig.host,
  port: dbConfig.port,
  database: dbConfig.database,
  user: dbConfig.user,
  ssl: dbConfig.ssl,
  passwordSet: !!dbConfig.password
});

const pool = new Pool(dbConfig);

// Database instance
const db = {
  query: (text, params) => pool.query(text, params),
  pool: pool
};

// Test database connection
async function testConnection() {
  try {
    console.log('Testing database connection...');
    const result = await db.query('SELECT NOW() as current_time, version() as pg_version');
    console.log('Database connected successfully at:', result.rows[0].current_time);
    console.log('PostgreSQL version:', result.rows[0].pg_version);
    return true;
  } catch (error) {
    console.error('Database connection error:', error.message);
    console.error('Connection details:', {
      host: dbConfig.host,
      port: dbConfig.port,
      database: dbConfig.database,
      user: dbConfig.user
    });
    throw error;
  }
}

// Employee database functions
const employeeDb = {
  async getById(id) {
    const query = 'SELECT * FROM employees WHERE id = $1';
    const result = await db.query(query, [id]);
    return result.rows[0];
  },
  
  async updateLastLogin(id) {
    const query = `
      UPDATE employees 
      SET last_login = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING last_login
    `;
    const result = await db.query(query, [id]);
    return result.rows[0];
  }
};

// Location database functions
const locationDb = {
  async getById(id) {
    const query = 'SELECT * FROM locations WHERE id = $1';
    const result = await db.query(query, [id]);
    return result.rows[0];
  },
  
  async isWithinLocation(latitude, longitude, locationId) {
    const query = `
      SELECT 
        *,
        (6371 * acos(cos(radians($1)) * cos(radians(latitude)) * 
        cos(radians(longitude) - radians($2)) + sin(radians($1)) * 
        sin(radians(latitude)))) AS distance
      FROM locations 
      WHERE id = $3
    `;
    const result = await db.query(query, [latitude, longitude, locationId]);
    const location = result.rows[0];
    
    if (location) {
      return {
        ...location,
        isWithinRadius: location.distance <= (location.radius / 1000)
      };
    }
    return null;
  }
};

// Attendance-related database functions
const attendanceDb = {
  // Get all attendance records for today (instead of just one)
  async getTodayAttendanceRecords(employeeId) {
    const query = `
      SELECT * FROM attendance 
      WHERE employee_id = $1 
      AND attendance_date = CURRENT_DATE
      ORDER BY check_in_time DESC
    `;
    const result = await db.query(query, [employeeId]);
    return result.rows;
  },

  // Get the latest attendance record for today
  async getLatestTodayAttendance(employeeId) {
    const query = `
      SELECT * FROM attendance 
      WHERE employee_id = $1 
      AND attendance_date = CURRENT_DATE
      ORDER BY check_in_time DESC
      LIMIT 1
    `;
    const result = await db.query(query, [employeeId]);
    return result.rows[0];
  },

  // Check if employee is currently checked in (last record has no check-out)
  async isCurrentlyCheckedIn(employeeId) {
    const query = `
      SELECT * FROM attendance 
      WHERE employee_id = $1 
      AND attendance_date = CURRENT_DATE
      AND check_out_time IS NULL
      ORDER BY check_in_time DESC
      LIMIT 1
    `;
    const result = await db.query(query, [employeeId]);
    return result.rows[0]; // Returns record if checked in, null if not
  },

  // Record check-in (always create new record)
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

  // Record check-out (update the latest open record)
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
      AND id = (
        SELECT id FROM attendance 
        WHERE employee_id = $1 
        AND attendance_date = CURRENT_DATE
        AND check_out_time IS NULL
        ORDER BY check_in_time DESC 
        LIMIT 1
      )
      RETURNING id, employee_id, attendance_date, check_in_time, check_out_time,
               check_in_latitude, check_in_longitude, check_out_latitude, 
               check_out_longitude, total_hours, location_verified
    `;
    const result = await db.query(query, [employeeId, latitude, longitude]);
    return result.rows[0];
  },

  // Get daily summary with total hours
  async getDailySummary(employeeId, date = null) {
    const targetDate = date || 'CURRENT_DATE';
    const query = `
      SELECT 
        attendance_date,
        COUNT(*) as total_sessions,
        COUNT(CASE WHEN check_out_time IS NOT NULL THEN 1 END) as completed_sessions,
        COUNT(CASE WHEN check_out_time IS NULL THEN 1 END) as ongoing_sessions,
        COALESCE(SUM(total_hours), 0) as total_hours_worked,
        MIN(check_in_time) as first_check_in,
        MAX(check_out_time) as last_check_out
      FROM attendance 
      WHERE employee_id = $1 
      AND attendance_date = ${targetDate}
      GROUP BY attendance_date
    `;
    const result = await db.query(query, [employeeId]);
    return result.rows[0];
  },

  // Get employee attendance history with session counts
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
        location_verified,
        CASE 
          WHEN check_out_time IS NULL THEN 'ongoing'
          ELSE 'completed'
        END as status
      FROM attendance 
      WHERE employee_id = $1 
      ORDER BY attendance_date DESC, check_in_time DESC 
      LIMIT $2
    `;
    const result = await db.query(query, [employeeId, limit]);
    return result.rows;
  }
};

module.exports = {
  db,
  employeeDb,
  attendanceDb,
  locationDb,
  testConnection,
  pool
};
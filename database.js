// Updated database.js - Modified for multiple check-ins

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
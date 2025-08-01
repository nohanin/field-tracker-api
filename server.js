// Updated server.js API endpoints for multiple check-ins + location search
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
require('dotenv').config();

// Import database functions
const { db, employeeDb, attendanceDb, locationDb, testConnection } = require('./database');

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 8000;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    service: 'Field Tracker API'
  });
});

// Database test endpoint - for debugging only (remove in production)
app.get('/debug/employees', async (req, res) => {
  try {
    const query = 'SELECT id, name, email, pin_code, is_active FROM employees LIMIT 10';
    const result = await db.query(query);
    res.json({
      success: true,
      message: 'Employee data retrieved',
      count: result.rows.length,
      data: result.rows
    });
  } catch (error) {
    console.error('Debug employees error:', error);
    res.status(500).json({
      success: false,
      message: 'Database query failed',
      error: error.message
    });
  }
});

// Test employee lookup endpoint
app.get('/debug/employee/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const employee = await employeeDb.getById(id);
    res.json({
      success: true,
      employee_id: id,
      found: !!employee,
      data: employee
    });
  } catch (error) {
    console.error('Debug employee lookup error:', error);
    res.status(500).json({
      success: false,
      message: 'Employee lookup failed',
      error: error.message
    });
  }
});

// NEW: Location search API endpoints
// Search locations with query parameters (supports partial matching)
app.get('/api/locations/search', async (req, res) => {
  try {
    const { location_code, location_type } = req.query;
    
    // Log search parameters for debugging
    console.log('=== LOCATION SEARCH REQUEST ===');
    console.log('Query parameters:', { location_code, location_type });
    console.log('==============================');
    
    // Validate that at least one search parameter is provided
    if (!location_code && !location_type) {
      return res.status(400).json({
        success: false,
        message: 'At least one search parameter (location_code or location_type) is required'
      });
    }
    
    // Search locations using partial matching
    const locations = await locationDb.searchLocations(location_code, location_type);
    
    const response = {
      success: true,
      message: 'Location search completed',
      search_criteria: {
        location_code: location_code || null,
        location_type: location_type || null
      },
      count: locations.length,
      data: locations
    };
    
    console.log('Search results:', {
      criteria: { location_code, location_type },
      found: locations.length,
      results: locations
    });
    
    res.json(response);
    
  } catch (error) {
    console.error('Location search error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error during location search',
      error: error.message
    });
  }
});

// Search locations with exact matching
app.get('/api/locations/search-exact', async (req, res) => {
  try {
    const { location_code, location_type } = req.query;
    
    // Log search parameters for debugging
    console.log('=== EXACT LOCATION SEARCH REQUEST ===');
    console.log('Query parameters:', { location_code, location_type });
    console.log('====================================');
    
    // Validate that at least one search parameter is provided
    if (!location_code && !location_type) {
      return res.status(400).json({
        success: false,
        message: 'At least one search parameter (location_code or location_type) is required'
      });
    }
    
    // Search locations using exact matching
    const locations = await locationDb.searchLocationsExact(location_code, location_type);
    
    const response = {
      success: true,
      message: 'Exact location search completed',
      search_criteria: {
        location_code: location_code || null,
        location_type: location_type || null
      },
      count: locations.length,
      data: locations
    };
    
    console.log('Exact search results:', {
      criteria: { location_code, location_type },
      found: locations.length,
      results: locations
    });
    
    res.json(response);
    
  } catch (error) {
    console.error('Exact location search error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error during exact location search',
      error: error.message
    });
  }
});

// Alternative POST endpoint for location search (for complex search criteria)
app.post('/api/locations/search', async (req, res) => {
  try {
    const { location_code, location_type, exact_match = false } = req.body;
    
    // Log search parameters for debugging
    console.log('=== LOCATION SEARCH POST REQUEST ===');
    console.log('Request body:', JSON.stringify(req.body, null, 2));
    console.log('===================================');
    
    // Validate that at least one search parameter is provided
    if (!location_code && !location_type) {
      return res.status(400).json({
        success: false,
        message: 'At least one search parameter (location_code or location_type) is required'
      });
    }
    
    // Choose search method based on exact_match flag
    const locations = exact_match 
      ? await locationDb.searchLocationsExact(location_code, location_type)
      : await locationDb.searchLocations(location_code, location_type);
    
    const response = {
      success: true,
      message: `Location search completed (${exact_match ? 'exact' : 'partial'} matching)`,
      search_criteria: {
        location_code: location_code || null,
        location_type: location_type || null,
        exact_match: exact_match
      },
      count: locations.length,
      data: locations
    };
    
    console.log('POST search results:', {
      criteria: { location_code, location_type, exact_match },
      found: locations.length,
      results: locations
    });
    
    res.json(response);
    
  } catch (error) {
    console.error('Location search POST error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error during location search',
      error: error.message
    });
  }
});

// Check-in route - Allow multiple check-ins
app.post('/api/attendance/checkin', async (req, res) => {
  try {
    // Log all received parameters for debugging
    console.log('=== CHECK-IN REQUEST DEBUG ===');
    console.log('Request body:', JSON.stringify(req.body, null, 2));
    console.log('Request timestamp:', new Date().toISOString());
    console.log('==============================');
    
    const { employee_id, latitude, longitude, location_id, location_code, location_type } = req.body;
    
    // Log extracted parameters
    console.log('Extracted parameters:');
    console.log('- employee_id:', employee_id, '(type:', typeof employee_id, ')');
    console.log('- latitude:', latitude, '(type:', typeof latitude, ')');
    console.log('- longitude:', longitude, '(type:', typeof longitude, ')');
    console.log('- location_id:', location_id, '(type:', typeof location_id, ')');
    console.log('- location_code:', location_code, '(type:', typeof location_code, ')');
    console.log('- location_type:', location_type, '(type:', typeof location_type, ')');
    
    // Validate input
    if (!employee_id) {
      return res.status(400).json({
        success: false,
        message: 'Employee ID is required'
      });
    }
    
    if (!latitude || !longitude) {
      return res.status(400).json({
        success: false,
        message: 'Location (latitude and longitude) is required'
      });
    }
    
    // Validate coordinates
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      return res.status(400).json({
        success: false,
        message: 'Invalid coordinates'
      });
    }
    
    // Check if employee exists
    const employee = await employeeDb.getById(employee_id);
    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found'
      });
    }
    
    // Check if employee is already checked in
    const currentlyCheckedIn = await attendanceDb.isCurrentlyCheckedIn(employee_id);
    if (currentlyCheckedIn) {
      return res.status(409).json({
        success: false,
        message: 'You are already checked in. Please check out first.',
        data: {
          current_session: {
            id: currentlyCheckedIn.id,
            check_in_time: currentlyCheckedIn.check_in_time,
            location: {
              latitude: currentlyCheckedIn.check_in_latitude,
              longitude: currentlyCheckedIn.check_in_longitude
            }
          }
        }
      });
    }
    
    // Verify location if location_id provided
    let locationVerified = false;
    let locationName = null;
    let finalLocationCode = location_code;
    
    // Handle location type "others" - store location_code as-is
    if (location_type && location_type.toLowerCase() === 'others') {
      console.log('Location type is "others" - storing location_code as-is:', location_code);
      finalLocationCode = location_code;
    } else if (location_id || employee.assigned_location_id) {
      const checkLocationId = location_id || employee.assigned_location_id;
      const locationCheck = await locationDb.isWithinLocation(latitude, longitude, checkLocationId);
      
      if (locationCheck) {
        locationVerified = locationCheck.isWithinRadius;
        locationName = locationCheck.name;
      }
    }
    
    // Record check-in (always creates new record)
    const attendance = await attendanceDb.checkIn(
      employee_id, 
      latitude, 
      longitude, 
      locationVerified,
      finalLocationCode
    );
    
    // Get today's summary
    const dailySummary = await attendanceDb.getDailySummary(employee_id);
    
    const response = {
      success: true,
      message: 'Check-in recorded successfully',
      data: {
        attendance_id: attendance.id,
        employee_id: attendance.employee_id,
        employee_name: employee.name,
        check_in_time: attendance.check_in_time,
        location: {
          latitude: parseFloat(attendance.check_in_latitude),
          longitude: parseFloat(attendance.check_in_longitude)
        },
        location_verified: attendance.location_verified,
        location_name: locationName,
        location_type: location_type,
        check_in_location_code: attendance.check_in_location_code,
        daily_summary: dailySummary,
        server_time: new Date().toISOString()
      }
    };
    
    console.log('Check-in successful:', {
      employee_id: attendance.employee_id,
      session_id: attendance.id,
      time: attendance.check_in_time,
      verified: attendance.location_verified
    });
    
    res.json(response);
    
  } catch (error) {
    console.error('Check-in error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error during check-in'
    });
  }
});

// Employee Login API
app.post('/api/auth/login', async (req, res) => {
  try {
    const { employee_id, pin_code } = req.body;
    
    // Log received parameters for debugging
    console.log('=== LOGIN REQUEST DEBUG ===');
    console.log('Request body:', JSON.stringify(req.body, null, 2));
    console.log('Extracted employee_id:', employee_id, '(type:', typeof employee_id, ')');
    console.log('Extracted pin_code:', pin_code, '(type:', typeof pin_code, ')');
    console.log('==============================');
    
    // Validate input
    if (!employee_id || !pin_code) {
      return res.status(400).json({
        success: false,
        message: 'Employee ID and PIN are required'
      });
    }
    
    // Get employee by ID
    const employee = await employeeDb.getById(employee_id);
    console.log('Database lookup result:', {
      found: !!employee,
      employee_data: employee ? {
        id: employee.id,
        name: employee.name,
        pin_exists: !!employee.pin_code,
        pin_value: employee.pin_code,
        pin_type: typeof employee.pin_code
      } : null
    });
    
    if (!employee) {
      return res.status(401).json({
        success: false,
        message: 'Invalid employee ID or PIN' 
      });
    }
    
    // Check if employee has a PIN set
    if (!employee.pin_code) {
      console.log('PIN not set for employee:', employee_id);
      return res.status(401).json({
        success: false,
        message: `PIN not set for employee ID ${employee_id}. Please contact administrator.`
      });
    }
    
    // Verify PIN (simple string comparison for now)
    if (pin_code.toString() !== employee.pin_code.toString()) {
      return res.status(401).json({
        success: false,
        message: 'Invalid employee ID or PIN'
      });
    }
    
    // Update last login
   // await employeeDb.updateLastLogin(employee_id);

    // Return success response with employee data
    res.json({
      success: true,
      message: 'Login successful',
      data: {
        id: employee.id,
        employee_id: employee.id,
        name: employee.name,
        employee_name: employee.name,
        email: employee.email,
        employee_email: employee.email,
        phone: employee.phone,
        employee_phone: employee.phone,
        assigned_location_id: employee.assigned_location_id,
        is_active: employee.is_active || true
      }
    });
    
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error during login'
    });
  }
});

// Check-out route - Check out from current session
app.post('/api/attendance/checkout', async (req, res) => {
  try {
    const { employee_id, latitude, longitude, location_code, location_type } = req.body;
    
    // Log all received parameters for debugging
    console.log('=== CHECK-OUT REQUEST DEBUG ===');
    console.log('Request body:', JSON.stringify(req.body, null, 2));
    console.log('Request timestamp:', new Date().toISOString());
    console.log('Extracted parameters:');
    console.log('- employee_id:', employee_id, '(type:', typeof employee_id, ')');
    console.log('- latitude:', latitude, '(type:', typeof latitude, ')');
    console.log('- longitude:', longitude, '(type:', typeof longitude, ')');
    console.log('- location_code:', location_code, '(type:', typeof location_code, ')');
    console.log('- location_type:', location_type, '(type:', typeof location_type, ')');
    console.log('==============================');
    
    // Validate input
    if (!employee_id) {
      return res.status(400).json({
        success: false,
        message: 'Employee ID is required'
      });
    }
    
    if (!latitude || !longitude) {
      return res.status(400).json({
        success: false,
        message: 'Location (latitude and longitude) is required'
      });
    }
    
    // Validate coordinates
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      return res.status(400).json({
        success: false,
        message: 'Invalid coordinates'
      });
    }
    
    // Check if employee exists
    const employee = await employeeDb.getById(employee_id);
    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found'
      });
    }
    
    // Check if employee is currently checked in
    const currentSession = await attendanceDb.isCurrentlyCheckedIn(employee_id);
    if (!currentSession) {
      return res.status(409).json({
        success: false,
        message: 'No active check-in session found. Please check in first.'
      });
    }
    
    // Determine final location code based on location type
    let finalLocationCode = location_code;
    
    // Handle location type "others" - store location_code as-is
    if (location_type && location_type.toLowerCase() === 'others') {
      console.log('Location type is "others" - storing location_code as-is:', location_code);
      finalLocationCode = location_code;
    }
    
    // Record check-out
    const attendance = await attendanceDb.checkOut(employee_id, latitude, longitude, finalLocationCode);
    
    if (!attendance) {
      return res.status(500).json({
        success: false,
        message: 'Failed to record check-out'
      });
    }
    
    // Get updated daily summary
    const dailySummary = await attendanceDb.getDailySummary(employee_id);
    
    const response = {
      success: true,
      message: 'Check-out recorded successfully',
      data: {
        attendance_id: attendance.id,
        employee_id: attendance.employee_id,
        employee_name: employee.name,
        check_in_time: attendance.check_in_time,
        check_out_time: attendance.check_out_time,
        session_duration: parseFloat(attendance.total_hours),
        location: {
          check_in: {
            latitude: parseFloat(attendance.check_in_latitude),
            longitude: parseFloat(attendance.check_in_longitude)
          },
          check_out: {
            latitude: parseFloat(attendance.check_out_latitude),
            longitude: parseFloat(attendance.check_out_longitude)
          }
        },
        location_verified: attendance.location_verified,
        location_type: location_type,
        check_in_location_code: attendance.check_in_location_code,
        check_out_location_code: attendance.check_out_location_code,
        daily_summary: dailySummary,
        server_time: new Date().toISOString()
      }
    };
    
    console.log('Check-out successful:', {
      employee_id: attendance.employee_id,
      session_id: attendance.id,
      time: attendance.check_out_time,
      duration: attendance.total_hours
    });
    
    res.json(response);
    
  } catch (error) {
    console.error('Check-out error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error during check-out'
    });
  }
});

// Get current status - shows if user is checked in and daily summary
app.get('/api/attendance/status/:employee_id', async (req, res) => {
  try {
    const { employee_id } = req.params;
    
    if (!employee_id) {
      return res.status(400).json({
        success: false,
        message: 'Employee ID is required'
      });
    }
    
    // Check if employee exists
    const employee = await employeeDb.getById(employee_id);
    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found'
      });
    }
    
    // Get current session
    const currentSession = await attendanceDb.isCurrentlyCheckedIn(employee_id);
    
    // Get today's records
    const todayRecords = await attendanceDb.getTodayAttendanceRecords(employee_id);
    
    // Get daily summary
    const dailySummary = await attendanceDb.getDailySummary(employee_id);
    
    const response = {
      success: true,
      employee_id: employee_id,
      employee_name: employee.name,
      is_checked_in: !!currentSession,
      current_session: currentSession ? {
        id: currentSession.id,
        check_in_time: currentSession.check_in_time,
        location: {
          latitude: parseFloat(currentSession.check_in_latitude),
          longitude: parseFloat(currentSession.check_in_longitude)
        },
        location_verified: currentSession.location_verified
      } : null,
      today_sessions: todayRecords.map(record => ({
        id: record.id,
        check_in_time: record.check_in_time,
        check_out_time: record.check_out_time,
        duration: record.total_hours ? parseFloat(record.total_hours) : null,
        status: record.check_out_time ? 'completed' : 'ongoing'
      })),
      daily_summary: dailySummary || {
        attendance_date: new Date().toISOString().split('T')[0],
        total_sessions: 0,
        completed_sessions: 0,
        ongoing_sessions: 0,
        total_hours_worked: 0,
        first_check_in: null,
        last_check_out: null
      }
    };
    
    res.json(response);
    
  } catch (error) {
    console.error('Status error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while fetching status'
    });
  }
});

// Get last N days attendance summary
app.get('/api/attendance/summary/:employee_id', async (req, res) => {
  try {
    const { employee_id } = req.params;
    const { days = 7 } = req.query; // Default to 7 days if not specified
    
    // Log request for debugging
    console.log('=== ATTENDANCE SUMMARY REQUEST ===');
    console.log('Employee ID:', employee_id);
    console.log('Days requested:', days);
    console.log('==================================');
    
    if (!employee_id) {
      return res.status(400).json({
        success: false,
        message: 'Employee ID is required'
      });
    }
    
    // Validate days parameter
    const numDays = parseInt(days);
    if (isNaN(numDays) || numDays < 1 || numDays > 365) {
      return res.status(400).json({
        success: false,
        message: 'Days parameter must be a number between 1 and 365'
      });
    }
    
    // Check if employee exists
    const employee = await employeeDb.getById(employee_id);
    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found'
      });
    }
    
    // Get last N days summary//10
    const summaryData = await attendanceDb.getLastNDaysSummary(employee_id, numDays);
    
    const response = {
      success: true,
      data: summaryData
    };
    
    console.log('Summary generated:', {
      employee_id: employee_id,
      days_requested: numDays,
      records_found: summaryData.length
    });
    
    res.json(response);
    
  } catch (error) {
    console.error('Attendance summary error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while fetching attendance summary',
      error: error.message
    });
  }
});

// Root route - API documentation
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Field Tracker API',
    version: '1.0.0',
    endpoints: {
      health: 'GET /health',
      auth: {
        login: 'POST /api/auth/login'
      },
      attendance: {
        checkin: 'POST /api/attendance/checkin (body: employee_id, latitude, longitude, location_code, location_type)',
        checkout: 'POST /api/attendance/checkout (body: employee_id, latitude, longitude, location_code, location_type)',
        status: 'GET /api/attendance/status/:employee_id',
        summary: 'GET /api/attendance/summary/:employee_id?days=N (default: 7 days)'
      },
      locations: {
        search: 'GET /api/locations/search?location_code=&location_type=',
        searchExact: 'GET /api/locations/search-exact?location_code=&location_type=',
        searchPost: 'POST /api/locations/search'
      }
    },
    notes: {
      location_type: 'When location_type is "others", location_code is stored as-is without location verification',
      summary_api: 'Returns last N days attendance summary with date, sessions, first check-in, last check-out, and duration'
    }
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    message: 'Internal server error'
  });
});

// Handle 404 - Route not found
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});

// Start server
async function startServer() {
  try {
    // Log environment info for debugging
    console.log('Starting server...');
    console.log('Environment:', process.env.NODE_ENV || 'development');
    console.log('Port:', PORT);
    console.log('Environment variables check:', {
      DB_HOST: !!process.env.DB_HOST,
      DB_PORT: !!process.env.DB_PORT,
      DB_NAME: !!process.env.DB_NAME,
      DB_USER: !!process.env.DB_USER,
      DB_PASSWORD: !!process.env.DB_PASSWORD
    });
    
    // Test database connection
    await testConnection();
    console.log('Database connection successful');
    
    // Start the server
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`Health check: http://localhost:${PORT}/health`);
      console.log(`API documentation: http://localhost:${PORT}/`);
      console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Handle process termination
process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('Received SIGINT, shutting down gracefully');
  process.exit(0);
});

// Start the server
startServer();
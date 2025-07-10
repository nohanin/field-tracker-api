// server.js - Updated with PostgreSQL database integration

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
require('dotenv').config();

// Import database functions
const { 
    db, 
    employeeDb, 
    attendanceDb, 
    locationDb, 
    testConnection 
} = require('./database');

const app = express();
const PORT = process.env.PORT || 8000;

// Middleware
app.use(helmet({
    contentSecurityPolicy: false,
}));
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
});

// Health check route
app.get('/', async (req, res) => {
    try {
        const dbStatus = await testConnection();
        res.json({
            message: 'Field Tracker API is running!',
            version: '1.0.0',
            timestamp: new Date().toISOString(),
            environment: process.env.NODE_ENV || 'production',
            database: dbStatus ? 'connected' : 'disconnected',
            port: PORT
        });
    } catch (error) {
        res.json({
            message: 'Field Tracker API is running!',
            version: '1.0.0',
            timestamp: new Date().toISOString(),
            environment: process.env.NODE_ENV || 'production',
            database: 'error',
            port: PORT
        });
    }
});

// Detailed health check
app.get('/health', async (req, res) => {
    try {
        const dbStatus = await testConnection();
        const employeeCount = await db.query('SELECT COUNT(*) FROM employees WHERE is_active = true');
        const attendanceCount = await db.query('SELECT COUNT(*) FROM attendance WHERE attendance_date = CURRENT_DATE');
        
        res.json({
            status: 'healthy',
            uptime: process.uptime(),
            timestamp: new Date().toISOString(),
            database: {
                status: dbStatus ? 'connected' : 'disconnected',
                activeEmployees: parseInt(employeeCount.rows[0].count),
                todayAttendance: parseInt(attendanceCount.rows[0].count)
            },
            memory: process.memoryUsage(),
            environment: {
                nodeVersion: process.version,
                platform: process.platform,
                arch: process.arch
            }
        });
    } catch (error) {
        console.error('Health check error:', error);
        res.status(500).json({
            status: 'unhealthy',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Employee authentication route
app.post('/api/auth/login', async (req, res) => {
    try {
        const { employee_id, pin_code } = req.body;
        
        if (!employee_id || !pin_code) {
            return res.status(400).json({
                success: false,
                message: 'Employee ID and PIN are required'
            });
        }
        
        const employee = await employeeDb.verifyPin(employee_id, pin_code);
        
        if (!employee) {
            return res.status(401).json({
                success: false,
                message: 'Invalid employee ID or PIN'
            });
        }
        
        res.json({
            success: true,
            message: 'Login successful',
            data: {
                employee_id: employee.id,
                name: employee.name,
                email: employee.email
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

// Check-in route with database integration
app.post('/api/attendance/checkin', async (req, res) => {
    try {
        const { employee_id, latitude, longitude, location_id } = req.body;
        
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
        
        // Check if already checked in today
        const todayAttendance = await attendanceDb.getTodayAttendance(employee_id);
        if (todayAttendance && todayAttendance.check_in_time) {
            return res.status(409).json({
                success: false,
                message: 'Already checked in today',
                data: {
                    check_in_time: todayAttendance.check_in_time,
                    location: {
                        latitude: todayAttendance.check_in_latitude,
                        longitude: todayAttendance.check_in_longitude
                    }
                }
            });
        }
        
        // Verify location if location_id provided
        let locationVerified = false;
        let locationName = null;
        
        if (location_id || employee.assigned_location_id) {
            const checkLocationId = location_id || employee.assigned_location_id;
            const locationCheck = await locationDb.isWithinLocation(latitude, longitude, checkLocationId);
            
            if (locationCheck) {
                locationVerified = locationCheck.isWithinRadius;
                locationName = locationCheck.name;
            }
        }
        
        // Record check-in
        const attendance = await attendanceDb.checkIn(
            employee_id, 
            latitude, 
            longitude, 
            locationVerified
        );
        
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
                server_time: new Date().toISOString()
            }
        };
        
        console.log('Check-in successful:', {
            employee_id: attendance.employee_id,
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

// Check-out route with database integration
app.post('/api/attendance/checkout', async (req, res) => {
    try {
        const { employee_id, latitude, longitude } = req.body;
        
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
        
        // Check if employee has checked in today
        const todayAttendance = await attendanceDb.getTodayAttendance(employee_id);
        if (!todayAttendance || !todayAttendance.check_in_time) {
            return res.status(409).json({
                success: false,
                message: 'No check-in record found for today'
            });
        }
        
        if (todayAttendance.check_out_time) {
            return res.status(409).json({
                success: false,
                message: 'Already checked out today',
                data: {
                    check_out_time: todayAttendance.check_out_time,
                    total_hours: todayAttendance.total_hours
                }
            });
        }
        
        // Record check-out
        const attendance = await attendanceDb.checkOut(employee_id, latitude, longitude);
        
        if (!attendance) {
            return res.status(500).json({
                success: false,
                message: 'Failed to record check-out'
            });
        }
        
        const response = {
            success: true,
            message: 'Check-out recorded successfully',
            data: {
                attendance_id: attendance.id,
                employee_id: attendance.employee_id,
                employee_name: employee.name,
                check_in_time: attendance.check_in_time,
                check_out_time: attendance.check_out_time,
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
                total_hours: parseFloat(attendance.total_hours),
                location_verified: attendance.location_verified,
                server_time: new Date().toISOString()
            }
        };
        
        console.log('Check-out successful:', {
            employee_id: attendance.employee_id,
            time: attendance.check_out_time,
            hours: attendance.total_hours
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

// Get attendance history with database integration
app.get('/api/attendance/history/:employee_id', async (req, res) => {
    try {
        const { employee_id } = req.params;
        const { limit } = req.query;
        
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
        
        const records = await attendanceDb.getHistory(employee_id, limit ? parseInt(limit) : 30);
        
        const formattedRecords = records.map(record => ({
            id: record.id,
            date: record.attendance_date,
            check_in_time: record.check_in_time,
            check_out_time: record.check_out_time,
            total_hours: record.total_hours ? parseFloat(record.total_hours) : null,
            location: {
                check_in: record.check_in_latitude && record.check_in_longitude ? {
                    latitude: parseFloat(record.check_in_latitude),
                    longitude: parseFloat(record.check_in_longitude)
                } : null,
                check_out: record.check_out_latitude && record.check_out_longitude ? {
                    latitude: parseFloat(record.check_out_latitude),
                    longitude: parseFloat(record.check_out_longitude)
                } : null
            },
            location_verified: record.location_verified,
            status: record.check_out_time ? 'completed' : 'ongoing'
        }));
        
        const response = {
            success: true,
            employee_id: employee_id,
            employee_name: employee.name,
            record_count: formattedRecords.length,
            records: formattedRecords
        };
        
        console.log(`History requested for employee: ${employee_id}, records: ${formattedRecords.length}`);
        res.json(response);
        
    } catch (error) {
        console.error('History error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error while fetching history'
        });
    }
});

// Get all employees
app.get('/api/employees', async (req, res) => {
    try {
        const employees = await employeeDb.getAll();
        res.json({
            success: true,
            count: employees.length,
            employees: employees
        });
    } catch (error) {
        console.error('Get employees error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error while fetching employees'
        });
    }
});

// Get all locations
app.get('/api/locations', async (req, res) => {
    try {
        const locations = await locationDb.getAll();
        res.json({
            success: true,
            count: locations.length,
            locations: locations
        });
    } catch (error) {
        console.error('Get locations error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error while fetching locations'
        });
    }
});

// Test endpoint
app.get('/api/test', async (req, res) => {
    try {
        const dbStatus = await testConnection();
        res.json({
            message: 'API test endpoint working',
            timestamp: new Date().toISOString(),
            database: dbStatus ? 'connected' : 'disconnected',
            api_version: '1.0.0'
        });
    } catch (error) {
        res.json({
            message: 'API test endpoint working',
            timestamp: new Date().toISOString(),
            database: 'error',
            api_version: '1.0.0'
        });
    }
});

// Global error handler
app.use((error, req, res, next) => {
    console.error('Global error handler:', error.stack);
    res.status(500).json({
        success: false,
        message: 'Something went wrong on the server',
        timestamp: new Date().toISOString()
    });
});

// 404 handler - must be last
app.use((req, res) => {
    console.log(`404 - Route not found: ${req.method} ${req.path}`);
    res.status(404).json({
        success: false,
        message: 'API endpoint not found',
        path: req.path,
        method: req.method,
        timestamp: new Date().toISOString()
    });
});

// Initialize database and start server
async function startServer() {
    try {
        // Test database connection
        const dbConnected = await testConnection();
        
        if (!dbConnected) {
            console.warn('⚠️  Database connection failed, but starting server anyway');
        }
        
        // Start server
        const server = app.listen(PORT, () => {
            console.log(`🚀 Field Tracker API started successfully`);
            console.log(`📍 Port: ${PORT}`);
            console.log(`🌍 Environment: ${process.env.NODE_ENV || 'production'}`);
            console.log(`🗄️  Database: ${dbConnected ? 'Connected' : 'Disconnected'}`);
            console.log(`⏰ Started at: ${new Date().toISOString()}`);
        });
        
        // Graceful shutdown
        process.on('SIGTERM', async () => {
            console.log('SIGTERM received, shutting down gracefully');
            server.close(async () => {
                console.log('HTTP server closed');
                try {
                    await db.close();
                    console.log('Database connection closed');
                } catch (error) {
                    console.error('Error closing database:', error);
                }
                process.exit(0);
            });
        });
        
        process.on('SIGINT', async () => {
            console.log('SIGINT received, shutting down gracefully');
            server.close(async () => {
                console.log('HTTP server closed');
                try {
                    await db.close();
                    console.log('Database connection closed');
                } catch (error) {
                    console.error('Error closing database:', error);
                }
                process.exit(0);
            });
        });
        
    } catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
}

// Start the server
startServer();

module.exports = app;
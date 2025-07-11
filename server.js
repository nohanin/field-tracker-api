// Updated server.js API endpoints for multiple check-ins

// Check-in route - Allow multiple check-ins
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
    
    if (location_id || employee.assigned_location_id) {
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
      locationVerified
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

// Check-out route - Check out from current session
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
    
    // Check if employee is currently checked in
    const currentSession = await attendanceDb.isCurrentlyCheckedIn(employee_id);
    if (!currentSession) {
      return res.status(409).json({
        success: false,
        message: 'No active check-in session found. Please check in first.'
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
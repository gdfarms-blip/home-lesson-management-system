const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth.middleware');
const pool = require('../config/database');

// Get attendance analytics
router.get('/attendance', authMiddleware, async (req, res) => {
  try {
    const { period = 'week', week, year } = req.query;
    const currentYear = new Date().getFullYear();
    const currentWeek = Math.floor((new Date().getDate() - 1) / 7) + 1;
    
    let query;
    let params = [];
    
    if (period === 'week') {
      const targetWeek = week || currentWeek;
      const targetYear = year || currentYear;
      
      query = `
        SELECT 
          t.name as teacher_name,
          COUNT(a.id) as total_lessons,
          COUNT(a.id) FILTER (WHERE a.status = 'present') as present,
          COUNT(a.id) FILTER (WHERE a.status = 'absent') as absent,
          COUNT(a.id) FILTER (WHERE a.status = 'late') as late,
          COUNT(a.id) FILTER (WHERE a.status = 'partial') as partial,
          ROUND((COUNT(a.id) FILTER (WHERE a.status IN ('present', 'late')) * 100.0 / 
                 NULLIF(COUNT(a.id), 0)), 0) as percentage
        FROM teachers t
        LEFT JOIN attendance a ON t.id = a.teacher_id 
          AND a.week_number = $1 
          AND a.year = $2
        WHERE t.status = 'active'
        GROUP BY t.id, t.name
        ORDER BY percentage DESC
      `;
      params = [targetWeek, targetYear];
    } else if (period === 'month') {
      const currentMonth = new Date().getMonth() + 1;
      
      query = `
        SELECT 
          t.name as teacher_name,
          COUNT(a.id) as total_lessons,
          COUNT(a.id) FILTER (WHERE a.status = 'present') as present,
          COUNT(a.id) FILTER (WHERE a.status = 'absent') as absent,
          COUNT(a.id) FILTER (WHERE a.status = 'late') as late,
          COUNT(a.id) FILTER (WHERE a.status = 'partial') as partial,
          ROUND((COUNT(a.id) FILTER (WHERE a.status IN ('present', 'late')) * 100.0 / 
                 NULLIF(COUNT(a.id), 0)), 0) as percentage
        FROM teachers t
        LEFT JOIN attendance a ON t.id = a.teacher_id 
          AND EXTRACT(MONTH FROM a.recorded_at) = $1
          AND EXTRACT(YEAR FROM a.recorded_at) = $2
        WHERE t.status = 'active'
        GROUP BY t.id, t.name
        ORDER BY percentage DESC
      `;
      params = [currentMonth, currentYear];
    }
    
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching attendance analytics:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get subject distribution
router.get('/subjects', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT 
        s.name as subject_name,
        COUNT(tt.id) as total_lessons,
        COUNT(DISTINCT tt.teacher_id) as teachers_count,
        STRING_AGG(DISTINCT t.name, ', ') as teachers
       FROM subjects s
       LEFT JOIN timetable tt ON s.id = tt.subject_id
       LEFT JOIN teachers t ON tt.teacher_id = t.id
       WHERE NOT tt.is_break
       GROUP BY s.id, s.name
       ORDER BY total_lessons DESC`
    );
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching subject distribution:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get payroll analytics
router.get('/payroll', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT 
        p.week_number,
        p.year,
        COUNT(p.id) as teachers_paid,
        SUM(p.total_amount) as total_amount,
        AVG(p.total_amount) as average_payment
       FROM payroll p
       WHERE p.paid = true
       GROUP BY p.week_number, p.year
       ORDER BY p.year DESC, p.week_number DESC
       LIMIT 12`
    );
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching payroll analytics:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get teacher performance metrics
router.get('/performance', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT 
        t.id,
        t.name as teacher_name,
        COUNT(DISTINCT a.week_number || '-' || a.year) as weeks_taught,
        COUNT(a.id) as total_lessons,
        COUNT(a.id) FILTER (WHERE a.status IN ('present', 'late')) as attended_lessons,
        ROUND((COUNT(a.id) FILTER (WHERE a.status IN ('present', 'late')) * 100.0 / 
               NULLIF(COUNT(a.id), 0)), 0) as attendance_rate,
        COALESCE(SUM(p.total_amount), 0) as total_earnings,
        COALESCE(AVG(p.total_amount), 0) as avg_weekly_earnings
       FROM teachers t
       LEFT JOIN attendance a ON t.id = a.teacher_id
       LEFT JOIN payroll p ON t.id = p.teacher_id AND p.paid = true
       WHERE t.status = 'active'
       GROUP BY t.id, t.name
       ORDER BY attendance_rate DESC`
    );
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching performance metrics:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;

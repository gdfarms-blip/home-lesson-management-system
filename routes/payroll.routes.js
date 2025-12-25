const express = require('express');
const router = express.Router();
const { authMiddleware, adminMiddleware } = require('../middleware/auth.middleware');
const pool = require('../config/database');
const { body, validationResult } = require('express-validator');

// Process payroll for a week
router.post('/process/:week/:year', [
  authMiddleware,
  adminMiddleware
], async (req, res) => {
  try {
    const { week, year } = req.params;
    
    await pool.query('BEGIN');
    
    // Get active teachers
    const teachers = await pool.query(
      'SELECT * FROM teachers WHERE status = $1',
      ['active']
    );
    
    const configResult = await pool.query(
      'SELECT config_value FROM system_config WHERE config_key = $1',
      ['teaching_allowance']
    );
    const teachingAllowance = parseInt(configResult.rows[0]?.config_value) || 20000;
    
    // Process each teacher
    for (const teacher of teachers.rows) {
      // Calculate attendance percentage for the week
      const attendanceResult = await pool.query(
        `SELECT 
          COUNT(*) as total_lessons,
          COUNT(*) FILTER (WHERE status IN ('present', 'late')) as attended
         FROM attendance
         WHERE teacher_id = $1 AND week_number = $2 AND year = $3`,
        [teacher.id, week, year]
      );
      
      const { total_lessons, attended } = attendanceResult.rows[0] || { total_lessons: 0, attended: 0 };
      const attendancePercentage = total_lessons > 0 ? (attended / total_lessons) * 100 : 0;
      
      // Calculate payments
      let teachingAllowanceAmount = 0;
      let transportAllowanceAmount = 0;
      
      if (attendancePercentage > 0) {
        teachingAllowanceAmount = teachingAllowance;
        
        // Check if transport allowance is enabled
        const transportConfig = await pool.query(
          'SELECT config_value FROM system_config WHERE config_key = $1',
          ['enable_transport_allowance']
        );
        
        if (transportConfig.rows[0]?.config_value === 'true') {
          const transportAmountConfig = await pool.query(
            'SELECT config_value FROM system_config WHERE config_key = $1',
            ['transport_allowance']
          );
          transportAllowanceAmount = parseInt(transportAmountConfig.rows[0]?.config_value) || 12000;
        }
      }
      
      // Check for existing payroll entry
      const existingPayroll = await pool.query(
        'SELECT id FROM payroll WHERE week_number = $1 AND year = $2 AND teacher_id = $3',
        [week, year, teacher.id]
      );
      
      const totalAmount = teachingAllowanceAmount + transportAllowanceAmount;
      
      if (existingPayroll.rows.length > 0) {
        // Update existing payroll
        await pool.query(
          `UPDATE payroll 
           SET teaching_allowance = $1, transport_allowance = $2, total_amount = $3,
               processed_at = CURRENT_TIMESTAMP, processed_by = $4
           WHERE id = $5`,
          [teachingAllowanceAmount, transportAllowanceAmount, totalAmount, req.user.id, existingPayroll.rows[0].id]
        );
      } else {
        // Create new payroll entry
        await pool.query(
          `INSERT INTO payroll 
           (week_number, year, teacher_id, teaching_allowance, transport_allowance, total_amount, processed_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [week, year, teacher.id, teachingAllowanceAmount, transportAllowanceAmount, totalAmount, req.user.id]
        );
      }
    }
    
    await pool.query('COMMIT');
    
    res.json({ message: `Payroll processed successfully for Week ${week}, ${year}` });
  } catch (error) {
    await pool.query('ROLLBACK');
    console.error('Error processing payroll:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get payroll for a specific week
router.get('/week/:week/:year', authMiddleware, async (req, res) => {
  try {
    const { week, year } = req.params;
    
    const result = await pool.query(
      `SELECT p.*, t.name as teacher_name
       FROM payroll p
       JOIN teachers t ON p.teacher_id = t.id
       WHERE p.week_number = $1 AND p.year = $2
       ORDER BY t.name`,
      [week, year]
    );
    
    // Calculate total
    const totalResult = await pool.query(
      'SELECT COALESCE(SUM(total_amount), 0) as total FROM payroll WHERE week_number = $1 AND year = $2',
      [week, year]
    );
    
    res.json({
      payroll: result.rows,
      total: parseFloat(totalResult.rows[0].total)
    });
  } catch (error) {
    console.error('Error fetching payroll:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update payroll adjustments
router.put('/adjust/:id', [
  authMiddleware,
  adminMiddleware,
  body('bonus').optional().isInt({ min: 0 }),
  body('deduction').optional().isInt({ min: 0 }),
  body('paid').optional().isBoolean()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const { id } = req.params;
    const { bonus, deduction, paid } = req.body;
    
    // Get current payroll
    const currentPayroll = await pool.query(
      'SELECT * FROM payroll WHERE id = $1',
      [id]
    );
    
    if (currentPayroll.rows.length === 0) {
      return res.status(404).json({ error: 'Payroll record not found' });
    }
    
    const current = currentPayroll.rows[0];
    const newBonus = bonus !== undefined ? bonus : current.bonus;
    const newDeduction = deduction !== undefined ? deduction : current.deduction;
    const newTotal = current.teaching_allowance + current.transport_allowance + newBonus - newDeduction;
    
    const result = await pool.query(
      `UPDATE payroll 
       SET bonus = $1, deduction = $2, total_amount = $3,
           paid = COALESCE($4, paid), payment_date = CASE WHEN $4 = true THEN CURRENT_DATE ELSE payment_date END
       WHERE id = $5
       RETURNING *`,
      [newBonus, newDeduction, newTotal, paid, id]
    );
    
    // Record payment in history if paid
    if (paid && !current.paid) {
      await pool.query(
        `INSERT INTO payment_history 
         (teacher_id, amount, payment_type, status, reference, notes, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          current.teacher_id,
          newTotal,
          'weekly_payroll',
          'completed',
          `PAY-${current.teacher_id}-${current.week_number}-${Date.now()}`,
          `Weekly payroll for Week ${current.week_number}, ${current.year}`,
          req.user.id
        ]
      );
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating payroll:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get payroll history
router.get('/history', authMiddleware, async (req, res) => {
  try {
    const { limit = 20, offset = 0 } = req.query;
    
    const result = await pool.query(
      `SELECT ph.*, t.name as teacher_name
       FROM payment_history ph
       JOIN teachers t ON ph.teacher_id = t.id
       ORDER BY ph.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    
    const totalResult = await pool.query(
      'SELECT COUNT(*) as total FROM payment_history'
    );
    
    res.json({
      payments: result.rows,
      total: parseInt(totalResult.rows[0].total)
    });
  } catch (error) {
    console.error('Error fetching payment history:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;

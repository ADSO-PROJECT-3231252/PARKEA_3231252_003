const router = require('express').Router();
const { verificarToken, verificarRol } = require('../middlewares/auth.middleware');
const adminController = require('../controllers/admin.controller');

router.use(verificarToken, verificarRol('admin'));

router.get('/dashboard', adminController.getDashboard);
router.get('/dashboard/occupancy', adminController.getOcupacionPorZona);
router.get('/dashboard/payments-status', adminController.getEstadoPagos);
router.get('/dashboard/recent-payments', adminController.getPagosRecientes);

router.get('/users', adminController.getUsuarios);
router.patch('/users/:id/role', adminController.cambiarRol);
router.patch('/users/:id/status', adminController.cambiarEstado);

module.exports = router;
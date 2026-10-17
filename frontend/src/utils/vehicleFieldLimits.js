// Mirrors the DB column limits (brand/model varchar(50), color varchar(30),
// visual_description varchar(255)) — see vehiculo.routes.js on the backend.
// Shared by RegisterVehicle.jsx and EditVehicle.jsx so both stay in sync.
export const MAX_LENGTH = {
    brand: 50,
    model: 50,
    color: 30,
    visualDescription: 255,
}; 

-- ADR-0147 — `services_packageitem.quantity` (sesiones de un bono) pasa a punto fijo ENTERO
-- de escala GLOBAL 10⁶ («2000000» = 2 sesiones): el mismo lenguaje que el resto del hub.
-- EL DINERO NO SE TOCA (céntimos, ADR-0123). Sin ventana mixta: solo escribe este módulo y
-- todo lo existente es lógico → reescalado ciego ×10⁶. Afinidad INTEGER → basta el UPDATE.
UPDATE services_packageitem SET quantity = quantity * 1000000;

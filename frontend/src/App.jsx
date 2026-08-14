import { useState } from 'react';
import Layout from './Layout';
import Inventory from './Inventory';

function App() {
  const [activeModule, setActiveModule] = useState('materias-primas');

  return (
    <Layout activeModule={activeModule} setActiveModule={setActiveModule}>
      {/* Mostramos el módulo correspondiente según la opción seleccionada */}
      {activeModule === 'materias-primas' && <Inventory />}
      
      {activeModule !== 'materias-primas' && (
        <div className="text-center py-20 text-conoflex-muted space-y-3 font-pixel">
          <p className="text-2xl text-white">Módulo [{activeModule.toUpperCase()}] en desarrollo</p>
          <p className="text-sm">Próximamente disponible para conexión con Google Sheets.</p>
        </div>
      )}
    </Layout>
  );
}

export default App;
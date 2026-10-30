// CSS de impresión de la solicitud (A4 vertical, multipágina). Copiado tal cual del módulo original.
export const CSS_IMPRESION = `
        @media print {
          @page {
            size: A4 portrait;
            margin: 12mm 15mm;
          }
          *, *::before, *::after {
            box-sizing: border-box;
          }
          html, body, #root, #root > div, #root > div > div, main, main > div {
            display: block !important;
            height: auto !important;
            min-height: 0 !important;
            max-height: none !important;
            position: static !important;
            transform: none !important;
            margin: 0 !important;
            padding: 0 !important;
            border: none !important;
            box-shadow: none !important;
            background: white !important;
          }
          .print-hidden, .bg-dots-orange, .animate-dots-drift {
            display: none !important;
          }
          .print-visible {
            display: block !important;
            width: 100% !important;
            height: auto !important;
            min-height: 0 !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          table {
            page-break-inside: auto !important;
          }
          thead {
            display: table-header-group !important; /* Repite encabezados si pasa a otra hoja */
          }
          tr {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
          .bloque-firmas-print {
            page-break-inside: avoid !important;
            break-inside: avoid !important; /* NUNCA SE CORTA POR LA MITAD */
            margin-top: 35px !important;
            padding-top: 15px !important;
          }
        }
        @media screen {
          .print-visible { display: none !important; }
        }
`;

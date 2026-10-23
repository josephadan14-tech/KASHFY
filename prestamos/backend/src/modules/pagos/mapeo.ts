import { aCentavos } from '../../db/pool.js';
import type { ConfigMora, CuotaPago } from './index.js';

export function filaACuotaPago(f: any): CuotaPago {
  return {
    numero: f.numero,
    fechaVencimiento: f.fecha_vencimiento,
    capitalCentavos: aCentavos(f.capital),
    interesCentavos: aCentavos(f.interes),
    capitalPagadoCentavos: aCentavos(f.capital_pagado),
    interesPagadoCentavos: aCentavos(f.interes_pagado),
    moraPagadaCentavos: aCentavos(f.mora_pagada),
    moraDevengadaCentavos: aCentavos(f.mora), // columna cuotas.mora = mora devengada
  };
}

export function filaAConfigMora(f: any): ConfigMora {
  return {
    diasGracia: f.dias_gracia,
    porcentajeDia: Number(f.mora_porcentaje_dia),
    montoFijoCentavos: aCentavos(f.mora_monto_fijo),
  };
}

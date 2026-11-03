const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export async function apiRequest<T = any>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint}`;
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  const res = await fetch(url, {
    ...options,
    headers,
    credentials: 'include',
  });

  if (!res.ok) {
    let errDetail = 'Request failed';
    try {
      const data = await res.json();
      errDetail = data.detail || data.message || errDetail;
    } catch {}
    const err = new Error(errDetail);
    (err as any).status = res.status;
    throw err;
  }

  return res.json();
}

export const api = {
  get: <T = any>(endpoint: string) => apiRequest<T>(endpoint, { method: 'GET' }),
  post: <T = any>(endpoint: string, data?: any) => apiRequest<T>(endpoint, {
    method: 'POST',
    body: data ? JSON.stringify(data) : undefined,
  }),
  put: <T = any>(endpoint: string, data?: any) => apiRequest<T>(endpoint, {
    method: 'PUT',
    body: data ? JSON.stringify(data) : undefined,
  }),
  patch: <T = any>(endpoint: string, data?: any) => apiRequest<T>(endpoint, {
    method: 'PATCH',
    body: data ? JSON.stringify(data) : undefined,
  }),
  delete: <T = any>(endpoint: string) => apiRequest<T>(endpoint, { method: 'DELETE' }),
};

/** Format integer poisha into standard Bangladeshi Taka notation (e.g. ৳1,55,550 or -৳1,36,238) */
export function formatTaka(poisha: number | undefined | null): string {
  if (poisha === undefined || poisha === null || isNaN(poisha)) return '৳0';
  const isNegative = poisha < 0;
  const absTaka = Math.abs(poisha) / 100;
  
  // Format with Bangladeshi comma grouping: 1,55,550.00
  const parts = absTaka.toFixed(2).split('.');
  const intPart = parts[0];
  const decPart = parts[1];

  let lastThree = intPart.slice(-3);
  const otherNumbers = intPart.slice(0, -3);
  if (otherNumbers !== '') {
    lastThree = ',' + lastThree;
  }
  const formattedInt = otherNumbers.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + lastThree;
  
  const formatted = decPart === '00' ? formattedInt : `${formattedInt}.${decPart}`;
  return isNegative ? `-৳${formatted}` : `৳${formatted}`;
}

export function formatPct(ratio: number | undefined | null): string {
  if (ratio === undefined || ratio === null || isNaN(ratio)) return '0%';
  return `${(ratio * 100).toFixed(1)}%`;
}

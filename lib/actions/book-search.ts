'use server';

export type KakaoBook = {
  title: string;
  authors: string[];
  thumbnail: string;
  publisher: string;
};

export async function searchBooks(query: string): Promise<{ ok: true; books: KakaoBook[] } | { ok: false; error: string }> {
  if (!query.trim()) return { ok: true, books: [] };

  const apiKey = process.env.KAKAO_REST_API_KEY;
  if (!apiKey) return { ok: false, error: 'KAKAO_REST_API_KEY가 설정되지 않았습니다.' };

  try {
    const url = `https://dapi.kakao.com/v3/search/book?query=${encodeURIComponent(query)}&size=8`;
    const res = await fetch(url, {
      headers: { Authorization: `KakaoAK ${apiKey}` },
      cache: 'no-store',
    });

    if (!res.ok) return { ok: false, error: '책 검색에 실패했습니다.' };

    const json = await res.json();
    const books: KakaoBook[] = (json.documents ?? []).map((d: {
      title: string;
      authors: string[];
      thumbnail: string;
      publisher: string;
    }) => ({
      title: d.title,
      authors: d.authors,
      thumbnail: d.thumbnail,
      publisher: d.publisher,
    }));

    return { ok: true, books };
  } catch {
    return { ok: false, error: '네트워크 오류가 발생했습니다.' };
  }
}

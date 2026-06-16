import React from 'react';

const UserIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);

const CalendarIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </svg>
);

const BookIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
  </svg>
);

const CheckCircle = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
    <polyline points="22 4 12 14.01 9 11.01" />
  </svg>
);

const AlertTriangle = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);

const ExternalLink = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    <polyline points="15 3 21 3 21 9" />
    <line x1="10" y1="14" x2="21" y2="3" />
  </svg>
);

export default function ReferenceCard({ result }) {
  const { found, originalText, parsed, match, matchDetails } = result;

  const doiUrl = match?.doi ? `https://doi.org/${match.doi}` : null;
  const displayAuthors = parsed.authors?.length
    ? parsed.authors.slice(0, 3).join(', ') + (parsed.authors.length > 3 ? ' vd.' : '')
    : null;

  return (
    <div className="ref-card">
      <div className={`ref-card-accent ${found ? 'found' : 'not-found'}`} />
      <div className="ref-card-body">
        {/* Header */}
        <div className="ref-card-header">
          <h3 className="ref-card-title">
            {match?.title || parsed.title || 'Başlık bulunamadı'}
          </h3>
          <span className={`ref-status-badge ${found ? 'found' : 'not-found'}`}>
            {found ? <><CheckCircle /> Doğrulandı</> : <><AlertTriangle /> Bulunamadı</>}
          </span>
        </div>

        {/* Original text */}
        <div className="ref-original">{originalText}</div>

        {/* Match info tags */}
        {found && matchDetails && (
          <div className="ref-match-info">
            {matchDetails.source && (
              <span className="ref-match-tag">
                <BookIcon /> {matchDetails.source}
              </span>
            )}
            {matchDetails.score != null && (
              <span className="ref-match-tag">
                Skor: {matchDetails.score}/100
              </span>
            )}
            {matchDetails.confidence && (
              <span className="ref-match-tag">
                {matchDetails.confidence === 'high' ? '🟢' : matchDetails.confidence === 'medium' ? '🟡' : '🔴'}
                {' '}
                {matchDetails.confidence === 'high' ? 'Yüksek güven' : matchDetails.confidence === 'medium' ? 'Orta güven' : 'Düşük güven'}
              </span>
            )}
            {(match?.isbn || parsed.isbn) && (
              <span className="ref-match-tag">
                <BookIcon /> ISBN: {match?.isbn || parsed.isbn}
              </span>
            )}
            {doiUrl && (
              <a href={doiUrl} target="_blank" rel="noreferrer" className="ref-match-tag" style={{ textDecoration: 'none' }}>
                <ExternalLink /> DOI
              </a>
            )}
            {!doiUrl && match?.url && (
              <a href={match.url} target="_blank" rel="noreferrer" className="ref-match-tag" style={{ textDecoration: 'none' }}>
                <ExternalLink /> Kaynak
              </a>
            )}
          </div>
        )}

        {!found && (
          <div className="ref-match-info">
            <span className="ref-match-tag">
              <AlertTriangle /> Akademik veritabanlarında doğrulanamadı
            </span>
          </div>
        )}

        {/* Metadata */}
        <div className="ref-card-meta">
          {displayAuthors && (
            <span className="ref-meta-item">
              <UserIcon /> Yazar: <strong>{displayAuthors}</strong>
            </span>
          )}
          {(parsed.year || match?.year) && (
            <span className="ref-meta-item">
              <CalendarIcon /> Yıl: <strong>{parsed.year || match?.year}</strong>
            </span>
          )}
          {(parsed.journal || match?.journal) && (
            <span className="ref-meta-item">
              <BookIcon /> Dergi: <strong>{parsed.journal || match?.journal}</strong>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

interface NavProps {
  totalDestinations: number
}

const menu = [
  ['list', 'Ma tier list', true],
  ['compass', 'Explorer', false],
  ['globe', 'Carte des destinations', false],
  ['clock', 'Activite', false],
  ['users', 'Amis', false],
  ['settings', 'Parametres', false],
] as const

export default function Nav({ totalDestinations }: NavProps) {
  return (
    <>
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <span />
            <span />
            <span />
          </div>
          <strong>TripTier</strong>
        </div>

        <button className="create-button">
          <Icon name="plus" />
          Creer une tier list
        </button>

        <nav className="side-menu" aria-label="Navigation principale">
          {menu.map(([icon, label, active]) => (
            <button className={active ? 'active' : ''} key={label}>
              <Icon name={icon} />
              {label}
            </button>
          ))}
        </nav>

        <div className="inspiration-card">
          <div className="balloon">✦</div>
          <div>
            <strong>Envie d'inspiration ?</strong>
            <p>Decouvrez des idees de voyages</p>
            <button>Explorer <Icon name="arrow" /></button>
          </div>
        </div>

        <div className="profile-card">
          <div className="profile-head">
            <div className="avatar">E</div>
            <div>
              <strong>Emma Martin</strong>
              <span>@emmavoyage</span>
            </div>
            <Icon name="chevron" />
          </div>
          <div className="profile-stats">
            <span><strong>{totalDestinations}</strong>Destinations</span>
            <span><strong>7</strong>Abonnes</span>
            <span><strong>342</strong>Vues</span>
          </div>
        </div>
      </aside>

      <header className="topbar">
        <label className="search-box">
          <Icon name="search" />
          <input placeholder="Rechercher une destination, une activite..." />
        </label>
        <div className="top-actions">
          <button><Icon name="sliders" />Filtres</button>
          <button><Icon name="sort" />Trier <Icon name="chevron" /></button>
          <button className="share"><Icon name="share" />Partager</button>
          <button className="bell" aria-label="Notifications"><Icon name="bell" /><span /></button>
          <button className="user-badge">S</button>
        </div>
      </header>

      <section className="page-title" aria-label="Titre de la page">
        <h1>Ma tier list — Destinations de reve ✨</h1>
        <p>Modifiee le 18 mai 2024</p>
      </section>
    </>
  )
}

function Icon({ name }: { name: string }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  }
  const paths: Record<string, JSX.Element> = {
    plus: <><path d="M12 5v14" /><path d="M5 12h14" /></>,
    list: <><path d="M8 6h13" /><path d="M8 12h13" /><path d="M8 18h13" /><path d="M3 6h.01" /><path d="M3 12h.01" /><path d="M3 18h.01" /></>,
    compass: <><circle cx="12" cy="12" r="9" /><path d="m15 9-2 5-5 2 2-5Z" /></>,
    globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3a13 13 0 0 1 0 18" /><path d="M12 3a13 13 0 0 0 0 18" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>,
    settings: <><path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" /><path d="M19.4 15a1.8 1.8 0 0 0 .36 1.98l.05.05a2.1 2.1 0 1 1-2.97 2.97l-.05-.05a1.8 1.8 0 0 0-1.98-.36 1.8 1.8 0 0 0-1.1 1.65V21a2.1 2.1 0 1 1-4.2 0v-.08a1.8 1.8 0 0 0-1.1-1.65 1.8 1.8 0 0 0-1.98.36l-.05.05a2.1 2.1 0 1 1-2.97-2.97l.05-.05A1.8 1.8 0 0 0 4.6 15a1.8 1.8 0 0 0-1.65-1.1H2.9a2.1 2.1 0 1 1 0-4.2H3a1.8 1.8 0 0 0 1.65-1.1 1.8 1.8 0 0 0-.36-1.98l-.05-.05a2.1 2.1 0 1 1 2.97-2.97l.05.05a1.8 1.8 0 0 0 1.98.36A1.8 1.8 0 0 0 10.3 2.4V2.3a2.1 2.1 0 1 1 4.2 0v.08a1.8 1.8 0 0 0 1.1 1.65 1.8 1.8 0 0 0 1.98-.36l.05-.05a2.1 2.1 0 1 1 2.97 2.97l-.05.05a1.8 1.8 0 0 0-.36 1.98 1.8 1.8 0 0 0 1.65 1.1h.08a2.1 2.1 0 1 1 0 4.2h-.08A1.8 1.8 0 0 0 19.4 15Z" /></>,
    arrow: <><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></>,
    chevron: <path d="m6 9 6 6 6-6" />,
    search: <><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></>,
    sliders: <><path d="M4 21v-7" /><path d="M4 10V3" /><path d="M12 21v-9" /><path d="M12 8V3" /><path d="M20 21v-5" /><path d="M20 12V3" /><path d="M1 14h6" /><path d="M9 8h6" /><path d="M17 16h6" /></>,
    sort: <><path d="M7 4v16" /><path d="m3 8 4-4 4 4" /><path d="M17 20V4" /><path d="m13 16 4 4 4-4" /></>,
    share: <><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="m8.6 13.5 6.8 4" /><path d="m15.4 6.5-6.8 4" /></>,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></>,
  }

  return <svg {...common}>{paths[name] ?? paths.list}</svg>
}

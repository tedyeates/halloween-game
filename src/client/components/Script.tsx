import { ROLE_LIST } from '../../shared/roles.js';
import type { RoleCategory } from '../../shared/types.js';

const categories: { id: RoleCategory; label: string }[] = [
  { id: 'townsfolk', label: 'Townsfolk' },
  { id: 'outsider', label: 'Outsiders' },
  { id: 'minion', label: 'Minions' },
  { id: 'demon', label: 'Demon' },
];

export default function Script() {
  return (
    <details className="script-panel">
      <summary>View the Hollowbrook role script <span>15 possible roles</span></summary>
      <div className="script-content">
        <p>Only a balanced subset appears each game. Roles are secret unless an ability reveals them.</p>
        {categories.map((category) => (
          <section key={category.id}>
            <h3 className={category.id}>{category.label}</h3>
            <div className="script-roles">
              {ROLE_LIST.filter((role) => role.category === category.id).map((role) => (
                <article key={role.id}>
                  <span aria-hidden="true">{role.icon}</span>
                  <div><h4>{role.name}</h4><p>{role.ability}</p></div>
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>
    </details>
  );
}

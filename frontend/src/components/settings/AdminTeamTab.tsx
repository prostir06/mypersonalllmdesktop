import React, { useEffect, useState } from 'react';
import { Alert, Button, Form, Spinner, Table } from 'react-bootstrap';
import type { AxiosError } from 'axios';
import { adminAPI, type AdminUser, type InviteRow, type SpendRow } from '../../services/api/admin';

function errorText(err: unknown, fallback: string): string {
  const ax = err as AxiosError<{ error?: string }>;
  return ax.response?.data?.error || fallback;
}

const AdminTeamTab: React.FC = () => {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [day, setDay] = useState<SpendRow[]>([]);
  const [month, setMonth] = useState<SpendRow[]>([]);
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [link, setLink] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<number | null>(null);

  const load = async () => {
    setError('');
    const [userRes, dayRes, monthRes, inviteRes] = await Promise.all([
      adminAPI.listUsers(),
      adminAPI.spend('day'),
      adminAPI.spend('month'),
      adminAPI.listInvites(),
    ]);
    setUsers(userRes.data.users);
    setDay(dayRes.data.rows);
    setMonth(monthRes.data.rows);
    setInvites(inviteRes.data.invites);
  };

  useEffect(() => {
    let cancelled = false;
    load()
      .catch((err: unknown) => {
        if (!cancelled) setError(errorText(err, 'Не вдалося завантажити команду'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const save = async (user: AdminUser) => {
    setSavingId(user.id);
    setError('');
    try {
      await adminAPI.updateUser(user.id, {
        role: user.role,
        blocked: user.blocked,
        sharedKeyDailyLimitUsd: user.sharedKeyDailyLimitUsd,
      });
    } catch (err: unknown) {
      setError(errorText(err, 'Не вдалося зберегти'));
    } finally {
      setSavingId(null);
    }
  };

  const createInvite = async () => {
    setError('');
    try {
      const { data } = await adminAPI.createInvite();
      setLink(`${window.location.origin}/register?invite=${data.token}`);
      const listed = await adminAPI.listInvites();
      setInvites(listed.data.invites);
    } catch (err: unknown) {
      setError(errorText(err, 'Не вдалося створити запрошення'));
    }
  };

  if (loading) return <Spinner animation="border" size="sm" />;

  return (
    <div className="d-flex flex-column gap-3">
      {error && <Alert variant="danger">{error}</Alert>}
      {link && (
        <Alert variant="success">
          Посилання показується один раз: <span className="user-select-all">{link}</span>
        </Alert>
      )}

      <div className="glass-panel p-4">
        <h6 className="fw-semibold mb-3">Користувачі</h6>
        <Table responsive size="sm" className="mb-0 align-middle">
          <thead>
            <tr>
              <th>Email</th>
              <th>Роль</th>
              <th>Блок</th>
              <th>Ліміт $/день</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <td>{user.email}</td>
                <td>
                  <Form.Select
                    aria-label={`Роль ${user.email}`}
                    value={user.role}
                    onChange={(event) =>
                      setUsers((prev) =>
                        prev.map((row) =>
                          row.id === user.id
                            ? { ...row, role: event.target.value as AdminUser['role'] }
                            : row
                        )
                      )
                    }
                  >
                    <option value="admin">адмін</option>
                    <option value="member">учасник</option>
                  </Form.Select>
                </td>
                <td>
                  <Form.Check
                    aria-label={`Блок ${user.email}`}
                    checked={user.blocked}
                    onChange={(event) =>
                      setUsers((prev) =>
                        prev.map((row) =>
                          row.id === user.id ? { ...row, blocked: event.target.checked } : row
                        )
                      )
                    }
                  />
                </td>
                <td>
                  <Form.Control
                    aria-label={`Ліміт ${user.email}`}
                    value={user.sharedKeyDailyLimitUsd ?? ''}
                    placeholder="за замовч."
                    onChange={(event) => {
                      const raw = event.target.value.trim();
                      const next = raw === '' ? null : Number(raw);
                      setUsers((prev) =>
                        prev.map((row) =>
                          row.id === user.id ? { ...row, sharedKeyDailyLimitUsd: next } : row
                        )
                      );
                    }}
                  />
                </td>
                <td>
                  <Button
                    size="sm"
                    variant="outline-light"
                    disabled={savingId === user.id}
                    onClick={() => save(user)}
                  >
                    Зберегти
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>

      <SpendTable title="Витрата сьогодні (оцінка)" rows={day} />
      <SpendTable title="Витрата цього місяця (оцінка)" rows={month} />

      <div className="glass-panel p-4">
        <div className="d-flex justify-content-between align-items-center mb-3">
          <h6 className="fw-semibold mb-0">Запрошення</h6>
          <Button size="sm" onClick={createInvite}>
            Створити запрошення
          </Button>
        </div>
        <ul className="mb-0 small text-muted">
          {invites.map((invite) => (
            <li key={invite.id}>
              до {new Date(invite.expiresAt).toLocaleString('uk-UA')}
              {invite.usedAt ? ' — використано' : ' — активне'}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

function SpendTable({ title, rows }: { title: string; rows: SpendRow[] }) {
  return (
    <div className="glass-panel p-4">
      <h6 className="fw-semibold mb-3">{title}</h6>
      {rows.length === 0 ? (
        <p className="small text-muted mb-0">Немає записів.</p>
      ) : (
        <Table responsive size="sm" className="mb-0">
          <thead>
            <tr>
              <th>Email</th>
              <th>Модель</th>
              <th>$</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.userId}-${row.provider}-${row.model}`}>
                <td>{row.email}</td>
                <td>
                  {row.provider}/{row.model}
                </td>
                <td>{row.costUsd.toFixed(4)}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}

export default AdminTeamTab;

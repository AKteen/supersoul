"""call_sessions and participants

Revision ID: 20261104_0003
Revises: 20261104_0002
Create Date: 2026-11-04

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20261104_0003"
down_revision: Union[str, None] = "20261104_0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "call_sessions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("room_id", sa.Uuid(), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("recording_url", sa.Text(), nullable=True),
        sa.Column("transcript", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["room_id"], ["rooms.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_call_sessions_room_id_started_at", "call_sessions", ["room_id", "started_at"])

    op.create_table(
        "participants",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("session_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("joined_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("left_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["session_id"], ["call_sessions.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_participants_session_id"), "participants", ["session_id"], unique=False)
    op.create_index(op.f("ix_participants_user_id"), "participants", ["user_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_participants_user_id"), table_name="participants")
    op.drop_index(op.f("ix_participants_session_id"), table_name="participants")
    op.drop_table("participants")
    op.drop_index("ix_call_sessions_room_id_started_at", table_name="call_sessions")
    op.drop_table("call_sessions")

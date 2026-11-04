"""create rooms table

Revision ID: 20261104_0002
Revises: 20261104_0001
Create Date: 2026-11-04

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20261104_0002"
down_revision: Union[str, None] = "20261104_0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "rooms",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("slug", sa.String(length=64), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("host_id", sa.Uuid(), nullable=False),
        sa.Column("max_participants", sa.Integer(), nullable=False, server_default="10"),
        sa.Column("chat_room_id", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["host_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_rooms_slug"), "rooms", ["slug"], unique=True)


def downgrade() -> None:
    op.drop_index(op.f("ix_rooms_slug"), table_name="rooms")
    op.drop_table("rooms")

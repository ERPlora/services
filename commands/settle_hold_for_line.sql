UPDATE services_package_redemption
   SET status = 'consumed',
       settled_at = :now,
       expires_at = NULL,
       sale_id = :sale_id,
       updated_by = :current_user_id,
       updated_at = :now
 WHERE hub_id = :hub_id
   AND is_deleted = 0
   AND status = 'held'
   AND settled_at IS NULL
   AND checkout_ref IS NOT NULL
   AND checkout_ref = :order_id
   AND line_ref = :line_id;

-- The session held on ONE line becomes final because the sale says the voucher paid that line
-- (`services._settle_hold_for_line`, fired from `services._on_sale_completed`, sales#520). The
-- prose is at the BOTTOM by house rule (hub#1137/ADR-0387).
--
-- WHY BY LINE. `settle_holds_for_sale.sql` spends every hold of the checkout. That was right while
-- the till always knew which lines were covered — but after a reload or a resumed check it could
-- lose the «covered» mark, charge the cut at its price, and the blanket settle spent the session as
-- well: the customer paid twice. Now the sale names the row of each item and whether a tender
-- other than money paid it; the handler settles the covered rows here and hands the others back
-- through `hold_release_on_line_removed.sql` (`services._release_hold_for_line`).
--
-- The guard is `settle_holds_for_sale.sql`'s word for word plus `line_ref = :line_id`: the same
-- conditional UPDATE over the same row as the release, so settle and release cannot both win, and a
-- redelivered event finds the row already `consumed` and touches nothing. No `expect_rows`: a
-- covered line paid by a tender other than a voucher (a gift card) has no hold, and that is not a
-- failure.

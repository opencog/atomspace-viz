;
; pair-mi.scm -- Pipeline that counts pairs from pair-generator
;
; This file defines an Atomese pipeline that counts the number of
; pairs produced by the pair-generator. The pair-generator is set up
; dynamically from the web UI with a Meet pattern based on user selection.
;
; The pipeline is triggered by executing (Name "pair-counter").
;
; The web UI sets up:
;   - "pair generator": DontExec(Meet) for generating pairs
;
; Counts are stored on the Anchor "analytics" with compound keys:
;   - (Any "total"): total pair count
;   - (List (Any "left") <item>): left marginal count
;   - (List (Any "right") <item>): right marginal count
;   - (List (Any "pair") <left> <right>): pair count
;
; The Meet runs ONCE and all 4 counts are updated in a single pass.
;
(use-modules (opencog))

; ---------------------------------------------------------------
; Single-pass counting pipeline.
; For each pair, True executes all 4 IncrementValues.
(PipeLink (Name "pair-counter")
	(True
		(Filter
			(Rule (VariableList (Variable "left") (Variable "right"))
				(LinkSignature (Type 'LinkValue) (Variable "left") (Variable "right"))
				(True
					(IncrementValue (Anchor "analytics") (Any "total") (Number 1))
					(IncrementValue (Anchor "analytics") (List (Any "left") (Variable "left")) (Number 1))
					(IncrementValue (Anchor "analytics") (List (Any "right") (Variable "right")) (Number 1))
					(IncrementValue (Anchor "analytics") (List (Any "pair") (Variable "left") (Variable "right")) (Number 1))))
			(ValueOf (Anchor "analytics") (Predicate "pair generator")))))

; Fetch the total count
(PipeLink (Name "get total count")
	(ValueOf (Anchor "analytics") (Any "total")))

; ---------------------------------------------------------------

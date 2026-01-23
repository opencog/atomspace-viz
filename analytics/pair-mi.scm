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
;   - (Predicate "total"): total pair count
;   - (List (Predicate "left") <item>): left marginal count
;   - (List (Predicate "right") <item>): right marginal count
;   - (List (Predicate "pair") <left> <right>): pair count
;
(use-modules (opencog))

; ---------------------------------------------------------------
; Individual counting pipelines - each Filter handles one count type.
; (LinkValue is a Value and can't be stored, so we use separate Filters)

; Count total pairs
(PipeLink (Name "count-total")
	(True (Filter
		(Rule (VariableList (Variable "left") (Variable "right"))
			(LinkSignature (Type 'LinkValue) (Variable "left") (Variable "right"))
			(IncrementValue (Anchor "analytics") (Predicate "total") (Number 1)))
		(ValueOf (Anchor "analytics") (Predicate "pair generator")))))

; Count left marginals
(PipeLink (Name "count-left")
	(True (Filter
		(Rule (VariableList (Variable "left") (Variable "right"))
			(LinkSignature (Type 'LinkValue) (Variable "left") (Variable "right"))
			(IncrementValue (Anchor "analytics") (List (Predicate "left") (Variable "left")) (Number 1)))
		(ValueOf (Anchor "analytics") (Predicate "pair generator")))))

; Count right marginals
(PipeLink (Name "count-right")
	(True (Filter
		(Rule (VariableList (Variable "left") (Variable "right"))
			(LinkSignature (Type 'LinkValue) (Variable "left") (Variable "right"))
			(IncrementValue (Anchor "analytics") (List (Predicate "right") (Variable "right")) (Number 1)))
		(ValueOf (Anchor "analytics") (Predicate "pair generator")))))

; Count pairs
(PipeLink (Name "count-pairs")
	(True (Filter
		(Rule (VariableList (Variable "left") (Variable "right"))
			(LinkSignature (Type 'LinkValue) (Variable "left") (Variable "right"))
			(IncrementValue (Anchor "analytics") (List (Predicate "pair") (Variable "left") (Variable "right")) (Number 1)))
		(ValueOf (Anchor "analytics") (Predicate "pair generator")))))

; ---------------------------------------------------------------
; Master pipeline: run all 4 counting pipelines
(PipeLink (Name "pair-counter")
	(True
		(Name "count-total")
		(Name "count-left")
		(Name "count-right")
		(Name "count-pairs")))

; Fetch the total count
(PipeLink (Name "get total count")
	(ValueOf (Anchor "analytics") (Predicate "total")))

; ---------------------------------------------------------------

;
; pair-mi.scm -- Pipeline that counts pairs from pair-generator
;
; This file defines an Atomese pipeline that counts the number of
; pairs produced by the pair-generator. The pair-generator is set up
; dynamically from the web UI with a Meet pattern based on user selection.
;
; The pipeline is triggered by executing (Name "pair-counter").
;
; The count is stored on a temporary anchor (to be improved later).
;
(use-modules (opencog))

; ---------------------------------------------------------------
; The pair-counting pipeline.
;
; This pipeline:
; - Gets the Meet pattern from the analytics anchor
; - Executes it to generate pairs
; - For each pair, increments a counter on a temp anchor
; - Returns the final count
;
; The Meet should have been set up with:
;   (SetValue (Anchor "analytics") (Predicate "pair generator")
;       (DontExec (Meet ...)))
;
(PipeLink
	(Name "pair-counter")
	(Filter
		(Rule
			(VariableList (Variable "left") (Variable "right"))
			(LinkSignature (Type 'LinkValue) (Variable "left") (Variable "right"))
			; Increment the count on temp anchor
			(IncrementValue
				(Anchor "temp results fixme later")
				(Predicate "total")
				(Number 1)))
		; Input: pairs from the Meet stored on the anchor
		(ValueOf (Anchor "analytics") (Predicate "pair generator"))))

; ---------------------------------------------------------------

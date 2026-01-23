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
; Stage 1: Count all pairs, return results in a LinkValue
(PipeLink
	(Name "pair-counter")
	(PureExec
		; First: count all pairs, suppress output with True
		(True
			(Filter
				(Rule
					(VariableList (Variable "left") (Variable "right"))
					(LinkSignature (Type 'LinkValue) (Variable "left") (Variable "right"))
					; Increment the count on the pattern
					(IncrementValue
						(LiteralValueOf (Anchor "analytics") (Predicate "pair generator"))
						(Predicate "total")
						(Number 1)))
				; Input: pairs from the Meet stored on the anchor
				(ValueOf (Anchor "analytics") (Predicate "pair generator"))))
		; Second: fetch and return the total count (still in scratch space)
		(ValueOf
			(DontExec (LiteralValueOf (Anchor "analytics") (Predicate "pair generator")))
			(Predicate "total"))))

; Stage 2: Extract the FloatValue count from the pair-counter result
; The pair-counter returns (LinkValue (BoolValue 1) (FloatValue count))
; Filter iterates over the LinkValue elements, matching only the FloatValue
(PipeLink
	(Name "get total count")
	(Filter
		(Rule
			(Variable "$x")
			(Signature (Type 'FloatValue))
			(Variable "$x"))
		(Name "pair-counter")))

; ---------------------------------------------------------------

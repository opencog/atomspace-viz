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
; Stage 1: Count all pairs and build marginal/pair counts
; For each pair (left-val, right-val), we increment:
;   1. Total count on the generator pattern
;   2. Left marginal: Meet with left fixed, right variable
;   3. Right marginal: Meet with right fixed, left variable
;   4. Pair count: the specific edge with both fixed
;
; We use $L and $R as variable names for the marginal Meets to avoid
; capture by the Rule's variable substitution.
(PipeLink
	(Name "pair-counter")
	(PureExec
		; Count all pairs and build counts
		(True
			(Filter
				(Rule
					(VariableList (Variable "left") (Variable "right"))
					(LinkSignature (Type 'LinkValue) (Variable "left") (Variable "right"))
					; All increments - return value ignored by True
					(LinkValue
						; 1. Total count on the generator
						(IncrementValue
							(LiteralValueOf (Anchor "analytics") (Predicate "pair generator"))
							(Predicate "total")
							(Number 1))
						; 2. Left marginal - count for this left item across all right items
						(IncrementValue
							(Meet
								(Variable "$R")
								(Put
									(PremiseOf (ValueOf (Anchor "analytics") (Predicate "pair generator")))
									(List (Variable "left") (Variable "$R"))))
							(Predicate "count")
							(Number 1))
						; 3. Right marginal - count for this right item across all left items
						(IncrementValue
							(Meet
								(Variable "$L")
								(Put
									(PremiseOf (ValueOf (Anchor "analytics") (Predicate "pair generator")))
									(List (Variable "$L") (Variable "right"))))
							(Predicate "count")
							(Number 1))
						; 4. Pair count - count for this specific pair
						(IncrementValue
							(Put
								(PremiseOf (ValueOf (Anchor "analytics") (Predicate "pair generator")))
								(List (Variable "left") (Variable "right")))
							(Predicate "count")
							(Number 1))))
				; Input: pairs from the Meet stored on the anchor
				(ValueOf (Anchor "analytics") (Predicate "pair generator"))))
		; Fetch and return the total count
		(ValueOf
			(DontExec (LiteralValueOf (Anchor "analytics") (Predicate "pair generator")))
			(Predicate "total"))))

; Stage 2: Extract the FloatValue count from the pair-counter result
; The pair-counter returns (LinkValue (BoolValue 1) (FloatValue count))
; Use ElementOf to get element at index 1 (the FloatValue)
(PipeLink
	(Name "get total count")
	(ElementOf (Number 1) (Name "pair-counter")))

; ---------------------------------------------------------------
